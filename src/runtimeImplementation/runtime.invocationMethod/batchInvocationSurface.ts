/*
 * 文件定位：Agent 运行态实现层 / 运行态调用方法层。
 * 核心目的：承载 batch Invocation Surface 这一能力位点。
 * 能力要求1：需要把文件名表达的能力落实成清晰的类型、输入输出和最小行为。
 * 能力要求2：如果后续发现语义不足，应优先补接口契约，而不是把逻辑散落到相邻文件。
 * 边界：承托和治理运行态，不吞并执行引擎、模型适配器或官方模块内部实现。
 * 对接：需要服务 applicationSurface、officialModuleSurface、governancePlane、invocationMethod 和 inspection/debug 等运行面。
 * 实现提示：先补稳定类型契约、最小可测行为和清晰错误边界，再接入真实执行逻辑。
 */

import {
  createInvocationEnvelope,
  type InvocationEnvelope,
  type InvocationEnvelopeError,
  type InvocationEnvelopeGate,
  type InvocationEnvelopeKind,
  type InvocationEnvelopeSource,
  type InvocationEnvelopeTrace,
} from "./invocationEnvelope.js";

export type BatchInvocationItemKind = Extract<InvocationEnvelopeKind, "agent" | "interface" | "tool" | "model">;

export type BatchInvocationItem = {
  itemId: string;
  targetId: string;
  invocationKind: BatchInvocationItemKind;
  payload?: unknown;
  requestedScopes?: readonly string[];
};

export type BatchInvocationSurfaceRequest = {
  runtimeId: string;
  batchId: string;
  source: InvocationEnvelopeSource;
  items: readonly BatchInvocationItem[];
  runtimeReady?: boolean;
  allowedScopes?: readonly string[];
  contract?: InvocationEnvelopeGate;
  governance?: InvocationEnvelopeGate;
  trace?: InvocationEnvelopeTrace;
};

export type BatchInvocationSurfaceErrorCode = InvocationEnvelopeError["code"] | "MISSING_BATCH_ID" | "EMPTY_BATCH";

export type BatchInvocationSurfaceError = {
  code: BatchInvocationSurfaceErrorCode;
  message: string;
  boundary: InvocationEnvelopeError["boundary"] | "batch";
  itemId?: string;
};

export type BatchInvocationPlanItem = {
  itemId: string;
  envelope: InvocationEnvelope;
};

export type BatchInvocationPlan = {
  invocationType: "batch";
  runtimeId: string;
  batchId: string;
  items: readonly BatchInvocationPlanItem[];
  dispatch: "dry-run";
  unsafeSideEffects: false;
};

export type BatchInvocationSurfaceResult =
  | {
      ok: true;
      plan: BatchInvocationPlan;
      events: readonly string[];
    }
  | {
      ok: false;
      error: BatchInvocationSurfaceError;
      events: readonly string[];
    };

function isBlank(value: string | undefined): boolean {
  return typeof value !== "string" || value.trim().length === 0;
}

function failure(
  code: BatchInvocationSurfaceErrorCode,
  message: string,
  boundary: BatchInvocationSurfaceError["boundary"],
  itemId?: string,
): BatchInvocationSurfaceResult {
  return {
    ok: false,
    error: { code, message, boundary, itemId },
    events: ["runtime.invocation.batch.rejected"],
  };
}

export function createBatchInvocationSurface(
  request: BatchInvocationSurfaceRequest,
): BatchInvocationSurfaceResult {
  if (isBlank(request.batchId)) {
    return failure("MISSING_BATCH_ID", "batchId is required before creating a batch invocation", "input");
  }

  if (request.items.length === 0) {
    return failure("EMPTY_BATCH", "batch invocation requires at least one item", "batch");
  }

  const batchId = request.batchId.trim();
  const items: BatchInvocationPlanItem[] = [];

  for (const item of request.items) {
    const envelopeResult = createInvocationEnvelope({
      runtimeId: request.runtimeId,
      targetId: item.targetId,
      invocationKind: item.invocationKind,
      source: request.source,
      payload: item.payload,
      runtimeReady: request.runtimeReady,
      requestedScopes: item.requestedScopes,
      allowedScopes: request.allowedScopes,
      contract: request.contract,
      governance: request.governance,
      trace: {
        correlationId: request.trace?.correlationId ?? batchId,
        callerId: request.trace?.callerId,
        sessionId: request.trace?.sessionId,
      },
    });

    if (!envelopeResult.ok) {
      return failure(
        envelopeResult.error.code,
        envelopeResult.error.message,
        envelopeResult.error.boundary,
        item.itemId,
      );
    }

    items.push({
      itemId: item.itemId.trim() || envelopeResult.envelope.targetId,
      envelope: envelopeResult.envelope,
    });
  }

  return {
    ok: true,
    plan: {
      invocationType: "batch",
      runtimeId: items[0]?.envelope.runtimeId ?? request.runtimeId.trim(),
      batchId,
      items,
      dispatch: "dry-run",
      unsafeSideEffects: false,
    },
    events: ["runtime.invocation.batch.planned"],
  };
}
