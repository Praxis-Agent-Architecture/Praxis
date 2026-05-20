/*
 * 文件定位：Agent 运行态实现层 / 运行态调用方法层。
 * 核心目的：承载 invocation Envelope 这一能力位点。
 * 能力要求1：需要把文件名表达的能力落实成清晰的类型、输入输出和最小行为。
 * 能力要求2：如果后续发现语义不足，应优先补接口契约，而不是把逻辑散落到相邻文件。
 * 边界：承托和治理运行态，不吞并执行引擎、模型适配器或官方模块内部实现。
 * 对接：需要服务 applicationSurface、officialModuleSurface、governancePlane、invocationMethod 和 inspection/debug 等运行面。
 * 实现提示：先补稳定类型契约、最小可测行为和清晰错误边界，再接入真实执行逻辑。
 */

export type InvocationEnvelopeKind = "agent" | "interface" | "batch" | "tool" | "model" | "stream";

export type InvocationEnvelopeSource =
  | "application"
  | "official-module"
  | "runtime-surface"
  | "inspection"
  | "debug";

export type InvocationEnvelopeErrorCode =
  | "MISSING_RUNTIME_ID"
  | "MISSING_TARGET_ID"
  | "MISSING_INVOCATION_KIND"
  | "RUNTIME_NOT_READY"
  | "CONTRACT_REJECTED"
  | "GOVERNANCE_REJECTED"
  | "SCOPE_DENIED";

export type InvocationEnvelopeError = {
  code: InvocationEnvelopeErrorCode;
  message: string;
  boundary: "input" | "runtime-state" | "contract" | "governance" | "scope";
};

export type InvocationEnvelopeGate = {
  accepted: boolean;
  reason?: string;
};

export type InvocationEnvelopeTrace = {
  correlationId?: string;
  callerId?: string;
  sessionId?: string;
};

export type InvocationEnvelopeRequest = {
  runtimeId: string;
  targetId: string;
  invocationKind: InvocationEnvelopeKind;
  source: InvocationEnvelopeSource;
  payload?: unknown;
  runtimeReady?: boolean;
  requestedScopes?: readonly string[];
  allowedScopes?: readonly string[];
  contract?: InvocationEnvelopeGate;
  governance?: InvocationEnvelopeGate;
  trace?: InvocationEnvelopeTrace;
};

export type InvocationEnvelope = {
  envelopeId: string;
  runtimeId: string;
  targetId: string;
  invocationKind: InvocationEnvelopeKind;
  source: InvocationEnvelopeSource;
  requestedScopes: readonly string[];
  grantedScopes: readonly string[];
  deniedScopes: readonly string[];
  trace: InvocationEnvelopeTrace;
  payload?: unknown;
  accepted: true;
  dryRun: true;
  unsafeSideEffects: false;
};

export type InvocationEnvelopeResult =
  | {
      ok: true;
      envelope: InvocationEnvelope;
      events: readonly string[];
    }
  | {
      ok: false;
      error: InvocationEnvelopeError;
      events: readonly string[];
    };

function isBlank(value: string | undefined): boolean {
  return typeof value !== "string" || value.trim().length === 0;
}

function cleanList(values: readonly string[] | undefined): readonly string[] {
  return [...new Set((values ?? []).map((value) => value.trim()).filter(Boolean))];
}

function failure(
  code: InvocationEnvelopeErrorCode,
  message: string,
  boundary: InvocationEnvelopeError["boundary"],
): InvocationEnvelopeResult {
  return {
    ok: false,
    error: { code, message, boundary },
    events: ["runtime.invocation.envelope.rejected"],
  };
}

function buildEnvelopeId(
  runtimeId: string,
  invocationKind: InvocationEnvelopeKind,
  targetId: string,
  trace: InvocationEnvelopeTrace,
): string {
  const stableTrace = trace.correlationId?.trim() || trace.sessionId?.trim() || "dry-run";
  return `${runtimeId}:${invocationKind}:${targetId}:${stableTrace}`;
}

export function createInvocationEnvelope(request: InvocationEnvelopeRequest): InvocationEnvelopeResult {
  if (isBlank(request.runtimeId)) {
    return failure("MISSING_RUNTIME_ID", "runtimeId is required before creating an invocation envelope", "input");
  }

  if (isBlank(request.targetId)) {
    return failure("MISSING_TARGET_ID", "targetId is required before creating an invocation envelope", "input");
  }

  if (isBlank(request.invocationKind)) {
    return failure(
      "MISSING_INVOCATION_KIND",
      "invocationKind is required before creating an invocation envelope",
      "input",
    );
  }

  if (request.runtimeReady === false) {
    return failure("RUNTIME_NOT_READY", "runtime must be ready before accepting invocation envelopes", "runtime-state");
  }

  if (request.contract?.accepted === false) {
    return failure(
      "CONTRACT_REJECTED",
      request.contract.reason ?? "invocation contract rejected the request",
      "contract",
    );
  }

  if (request.governance?.accepted === false) {
    return failure(
      "GOVERNANCE_REJECTED",
      request.governance.reason ?? "runtime governance rejected the invocation request",
      "governance",
    );
  }

  const runtimeId = request.runtimeId.trim();
  const targetId = request.targetId.trim();
  const requestedScopes = cleanList(request.requestedScopes);
  const allowedScopes = cleanList(request.allowedScopes);
  const grantedScopes =
    allowedScopes.length === 0
      ? requestedScopes
      : requestedScopes.filter((scope) => allowedScopes.includes(scope));
  const deniedScopes =
    allowedScopes.length === 0
      ? []
      : requestedScopes.filter((scope) => !allowedScopes.includes(scope));

  if (deniedScopes.length > 0) {
    return failure(
      "SCOPE_DENIED",
      `invocation request includes scopes outside the runtime boundary: ${deniedScopes.join(", ")}`,
      "scope",
    );
  }

  const trace: InvocationEnvelopeTrace = {
    correlationId: request.trace?.correlationId?.trim() || undefined,
    callerId: request.trace?.callerId?.trim() || undefined,
    sessionId: request.trace?.sessionId?.trim() || undefined,
  };

  return {
    ok: true,
    envelope: {
      envelopeId: buildEnvelopeId(runtimeId, request.invocationKind, targetId, trace),
      runtimeId,
      targetId,
      invocationKind: request.invocationKind,
      source: request.source,
      requestedScopes,
      grantedScopes,
      deniedScopes,
      trace,
      payload: request.payload,
      accepted: true,
      dryRun: true,
      unsafeSideEffects: false,
    },
    events: ["runtime.invocation.envelope.accepted"],
  };
}
