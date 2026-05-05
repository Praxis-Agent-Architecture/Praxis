/*
 * 文件定位：Agent 运行态实现层 / 调试面。
 * 核心目的：承载 debug Runtime 这一能力位点。
 * 能力要求1：需要把文件名表达的能力落实成清晰的类型、输入输出和最小行为。
 * 能力要求2：如果后续发现语义不足，应优先补接口契约，而不是把逻辑散落到相邻文件。
 * 边界：承托和治理运行态，不吞并执行引擎、模型适配器或官方模块内部实现。
 * 对接：需要服务 applicationSurface、officialModuleSurface、governancePlane、invocationMethod 和 inspection/debug 等运行面。
 * 实现提示：先补稳定类型契约、最小可测行为和清晰错误边界，再接入真实执行逻辑。
 */

import { collectDebugSnapshot, type DebugSnapshot, type DebugSnapshotSectionInput } from "./debugSnapshotCollector.js";
import { diffDebugState, type DebugStateDiff } from "./debugStateDiff.js";
import { recordDebugTrace, type DebugTraceEventInput, type DebugTraceSnapshot } from "./debugTraceRecorder.js";

export type DebugRuntimeBoundary = "input" | "contract" | "governance" | "runtime-state" | "scope" | "debug";

export type DebugRuntimeCallerKind = "application" | "official-module" | "runtime-surface" | "inspection" | "test";

export type DebugRuntimeCaller = {
  kind: DebugRuntimeCallerKind;
  id: string;
  moduleId?: string;
  sessionId?: string;
};

export type DebugRuntimeGate = {
  accepted: boolean;
  reason?: string;
};

export type DebugRuntimeCapability = "trace" | "snapshot" | "state-diff" | "replay-hook" | "probe" | (string & {});

export type DebugRuntimeAttachment = {
  trace?: DebugTraceSnapshot;
  snapshot?: DebugSnapshot;
  stateDiff?: DebugStateDiff;
};

export type DebugRuntimeSession = {
  runtimeId: string;
  debugSessionId: string;
  caller: DebugRuntimeCaller;
  route: "runtime.debug.debugRuntime";
  capabilities: readonly DebugRuntimeCapability[];
  attachments: DebugRuntimeAttachment;
  attachmentStatus: {
    traceRecorded: boolean;
    snapshotCollected: boolean;
    stateDiffComputed: boolean;
  };
  audit: {
    dryRun: true;
    unsafeSideEffects: false;
    governanceRequired: true;
    contractSurface: "runtime.contractSurface";
  };
};

export type DebugRuntimeRequest = {
  runtimeId?: string;
  debugSessionId?: string;
  caller?: DebugRuntimeCaller;
  requestedCapabilities?: readonly DebugRuntimeCapability[];
  allowedCapabilities?: readonly string[];
  traceEvents?: readonly DebugTraceEventInput[];
  snapshotSections?: readonly DebugSnapshotSectionInput[];
  beforeState?: Readonly<Record<string, unknown>>;
  afterState?: Readonly<Record<string, unknown>>;
  runtimeReady?: boolean;
  contract?: DebugRuntimeGate;
  governance?: DebugRuntimeGate;
};

export type DebugRuntimeErrorCode =
  | "MISSING_RUNTIME_ID"
  | "MISSING_CALLER"
  | "MISSING_DEBUG_CAPABILITIES"
  | "CAPABILITY_SCOPE_DENIED"
  | "TRACE_ATTACHMENT_FAILED"
  | "SNAPSHOT_ATTACHMENT_FAILED"
  | "STATE_DIFF_ATTACHMENT_FAILED"
  | "RUNTIME_NOT_READY"
  | "CONTRACT_REJECTED"
  | "GOVERNANCE_REJECTED";

export type DebugRuntimeError = {
  code: DebugRuntimeErrorCode;
  message: string;
  boundary: DebugRuntimeBoundary;
  safeForRuntimeInspection: true;
  internalDetailExposed: false;
};

export type DebugRuntimeResult =
  | {
      ok: true;
      session: DebugRuntimeSession;
      events: readonly string[];
    }
  | {
      ok: false;
      error: DebugRuntimeError;
      events: readonly string[];
    };

export const debugRuntimeDescriptor = {
  surface: "runtime.debug",
  capability: "debugRuntime",
  purpose: "open a governed dry-run debug runtime surface for trace, snapshot, and state diff attachments",
  unsafeSideEffects: false,
} as const;

function hasText(value: string | undefined): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

function cleanList<T extends string>(values: readonly T[] | undefined): readonly T[] {
  return [...new Set((values ?? []).map((value) => value.trim()).filter(Boolean) as T[])];
}

function normalizeCaller(caller: DebugRuntimeCaller): DebugRuntimeCaller {
  const normalized: DebugRuntimeCaller = {
    kind: caller.kind,
    id: caller.id.trim(),
  };

  const moduleId = caller.moduleId?.trim();
  if (moduleId !== undefined && moduleId.length > 0) {
    normalized.moduleId = moduleId;
  }

  const sessionId = caller.sessionId?.trim();
  if (sessionId !== undefined && sessionId.length > 0) {
    normalized.sessionId = sessionId;
  }

  return normalized;
}

function failure(code: DebugRuntimeErrorCode, message: string, boundary: DebugRuntimeBoundary): DebugRuntimeResult {
  return {
    ok: false,
    error: {
      code,
      message,
      boundary,
      safeForRuntimeInspection: true,
      internalDetailExposed: false,
    },
    events: ["runtime.debug.debugRuntime.rejected"],
  };
}

function attachmentBoundary(boundary: string): DebugRuntimeBoundary {
  if (
    boundary === "input" ||
    boundary === "contract" ||
    boundary === "governance" ||
    boundary === "runtime-state" ||
    boundary === "scope"
  ) {
    return boundary;
  }

  return "debug";
}

function callerForAttachment(caller: DebugRuntimeCaller) {
  return {
    kind: caller.kind,
    id: caller.id,
    moduleId: caller.moduleId,
    sessionId: caller.sessionId,
  };
}

export function createDebugRuntime(request?: DebugRuntimeRequest): DebugRuntimeResult {
  if (request === undefined || !hasText(request.runtimeId)) {
    return failure("MISSING_RUNTIME_ID", "debug runtime requires a runtimeId", "input");
  }

  if (request.caller === undefined || !hasText(request.caller.id)) {
    return failure("MISSING_CALLER", "debug runtime requires an application, module, or runtime caller", "input");
  }

  if (request.runtimeReady === false) {
    return failure("RUNTIME_NOT_READY", "debug runtime can only open against a ready runtime host", "runtime-state");
  }

  if (request.contract?.accepted === false) {
    return failure("CONTRACT_REJECTED", request.contract.reason ?? "debug runtime was rejected by contract", "contract");
  }

  if (request.governance?.accepted === false) {
    return failure(
      "GOVERNANCE_REJECTED",
      request.governance.reason ?? "debug runtime was rejected by governance",
      "governance",
    );
  }

  const capabilities = cleanList(request.requestedCapabilities);
  if (capabilities.length === 0) {
    return failure("MISSING_DEBUG_CAPABILITIES", "debug runtime requires at least one requested capability", "input");
  }

  const allowedCapabilities = cleanList(request.allowedCapabilities);
  if (allowedCapabilities.length > 0) {
    const deniedCapability = capabilities.find((capability) => !allowedCapabilities.includes(capability));
    if (deniedCapability !== undefined) {
      return failure("CAPABILITY_SCOPE_DENIED", `debug capability ${deniedCapability} is outside runtime scope`, "scope");
    }
  }

  const runtimeId = request.runtimeId.trim();
  const debugSessionId = request.debugSessionId?.trim() || `${runtimeId}:debugRuntime`;
  const caller = normalizeCaller(request.caller);
  const attachments: DebugRuntimeAttachment = {};
  const attachmentEvents: string[] = [];

  if (capabilities.includes("trace") && request.traceEvents !== undefined) {
    const traceResult = recordDebugTrace({
      runtimeId,
      traceId: `${debugSessionId}:trace`,
      caller: callerForAttachment(caller),
      events: request.traceEvents,
      runtimeReady: request.runtimeReady,
      contract: request.contract,
      governance: request.governance,
    });

    attachmentEvents.push(...traceResult.events);
    if (!traceResult.ok) {
      return failure("TRACE_ATTACHMENT_FAILED", traceResult.error.message, attachmentBoundary(traceResult.error.boundary));
    }

    attachments.trace = traceResult.trace;
  }

  if (capabilities.includes("snapshot") && request.snapshotSections !== undefined) {
    const snapshotResult = collectDebugSnapshot({
      runtimeId,
      snapshotId: `${debugSessionId}:snapshot`,
      caller: callerForAttachment(caller),
      sections: request.snapshotSections,
      runtimeReady: request.runtimeReady,
      contract: request.contract,
      governance: request.governance,
    });

    attachmentEvents.push(...snapshotResult.events);
    if (!snapshotResult.ok) {
      return failure(
        "SNAPSHOT_ATTACHMENT_FAILED",
        snapshotResult.error.message,
        attachmentBoundary(snapshotResult.error.boundary),
      );
    }

    attachments.snapshot = snapshotResult.snapshot;
  }

  if (capabilities.includes("state-diff") && request.beforeState !== undefined && request.afterState !== undefined) {
    const diffResult = diffDebugState({
      runtimeId,
      diffId: `${debugSessionId}:stateDiff`,
      caller: callerForAttachment(caller),
      beforeState: request.beforeState,
      afterState: request.afterState,
      runtimeReady: request.runtimeReady,
      contract: request.contract,
      governance: request.governance,
    });

    attachmentEvents.push(...diffResult.events);
    if (!diffResult.ok) {
      return failure("STATE_DIFF_ATTACHMENT_FAILED", diffResult.error.message, attachmentBoundary(diffResult.error.boundary));
    }

    attachments.stateDiff = diffResult.diff;
  }

  return {
    ok: true,
    session: {
      runtimeId,
      debugSessionId,
      caller,
      route: "runtime.debug.debugRuntime",
      capabilities,
      attachments,
      attachmentStatus: {
        traceRecorded: attachments.trace !== undefined,
        snapshotCollected: attachments.snapshot !== undefined,
        stateDiffComputed: attachments.stateDiff !== undefined,
      },
      audit: {
        dryRun: true,
        unsafeSideEffects: false,
        governanceRequired: true,
        contractSurface: "runtime.contractSurface",
      },
    },
    events: ["runtime.debug.debugRuntime.opened", ...attachmentEvents],
  };
}
