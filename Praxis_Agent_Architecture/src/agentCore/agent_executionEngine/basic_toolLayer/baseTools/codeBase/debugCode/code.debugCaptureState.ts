/*
 * 文件定位：Agent 执行引擎 / 基础工具原语层 / 基础工具集合 / 代码基础工具 / 代码调试工具。
 * 核心目的：提供 代码基础工具 / 代码调试工具 中的“捕获调试现场状态”基础能力原语。
 * 能力要求1：需要定义该能力的输入、输出、错误、权限需求和可观测事件。
 * 能力要求2：这些基础工具是 Agent 成立的底层能力，不是 TAP 的最终高级工具库。
 * 能力要求3：后续 TAP 可以基于这些原语构建更强的工具编排、审批、替换和专业能力库。
 * 边界：保留 Agent 基础工具原语，不替代 TAP 的高级工具系统。
 * 对接：需要被 runtime.execEngine 拉起，并和 mainLoop、stateEngine、事件暴露、工具调用策略接通。
 * 实现提示：先补稳定类型契约、最小可测行为和清晰错误边界，再接入真实执行逻辑。
 */

import {
  planBaseToolStorageWrite,
  type BaseToolStorageGate,
  type BaseToolStoragePlan,
} from "../../../baseTool_storagePlane.js";

export type CodeDebugCaptureStateBoundary = "input" | "contract" | "governance" | "scope" | "storage";

export type CodeDebugCaptureTargetKind = "debug-session" | "process" | "test-run" | "workspace";

export type CodeDebugCaptureTarget = {
  kind?: CodeDebugCaptureTargetKind;
  id?: string;
  cwd?: string;
};

export type CodeDebugCaptureOptions = {
  includeStack?: boolean;
  includeVariables?: boolean;
  includeBreakpoints?: boolean;
  maxVariables?: number;
};

export type CodeDebugCaptureStateRequest = {
  runtimeId?: string;
  sessionId?: string;
  invocationId?: string;
  target?: CodeDebugCaptureTarget;
  capture?: CodeDebugCaptureOptions;
  requestedScopes?: readonly string[];
  allowedScopes?: readonly string[];
  dryRun?: boolean;
  contract?: BaseToolStorageGate;
  governance?: BaseToolStorageGate;
};

export type CodeDebugCaptureStateErrorCode =
  | "MISSING_RUNTIME_ID"
  | "MISSING_SESSION_ID"
  | "MISSING_TARGET"
  | "MISSING_TARGET_ID"
  | "INVALID_CAPTURE_LIMIT"
  | "CONTRACT_REJECTED"
  | "GOVERNANCE_REJECTED"
  | "SCOPE_DENIED"
  | "REAL_DEBUG_CAPTURE_NOT_ALLOWED"
  | "STORAGE_PLAN_REJECTED";

export type CodeDebugCaptureStateError = {
  code: CodeDebugCaptureStateErrorCode;
  message: string;
  boundary: CodeDebugCaptureStateBoundary;
  safeForRuntimeInspection: true;
  internalDetailExposed: false;
};

export type CodeDebugCaptureStatePlan = {
  toolName: "code.debugCaptureState";
  runtimeId: string;
  sessionId: string;
  invocationId: string;
  target: {
    kind: CodeDebugCaptureTargetKind;
    id: string;
    cwd?: string;
  };
  permissions: readonly ["debug:read"];
  capture: Required<CodeDebugCaptureOptions>;
  execution: {
    dryRun: true;
    captured: false;
    unsafeSideEffects: false;
  };
  audit: {
    governanceRequired: true;
    tapHandoffReady: true;
  };
  storage: BaseToolStoragePlan;
};

export type CodeDebugCaptureStateResult =
  | {
      ok: true;
      plan: CodeDebugCaptureStatePlan;
      events: readonly string[];
    }
  | {
      ok: false;
      error: CodeDebugCaptureStateError;
      events: readonly string[];
    };

export const codeDebugCaptureStateDescriptor = {
  toolName: "code.debugCaptureState",
  toolFamily: "codeBase.debugCode",
  purpose: "capture a debug target state through a dry-run, governable tool envelope",
  dryRunOnly: true,
  unsafeSideEffects: false,
} as const;

function isBlank(value: string | undefined): boolean {
  return typeof value !== "string" || value.trim().length === 0;
}

function cleanList(values: readonly string[] | undefined): string[] {
  return [...new Set((values ?? []).map((value) => value.trim()).filter(Boolean))];
}

function failure(
  code: CodeDebugCaptureStateErrorCode,
  message: string,
  boundary: CodeDebugCaptureStateBoundary,
): CodeDebugCaptureStateResult {
  return {
    ok: false,
    error: {
      code,
      message,
      boundary,
      safeForRuntimeInspection: true,
      internalDetailExposed: false,
    },
    events: ["agentCore.basicTool.code.debugCaptureState.rejected"],
  };
}

function resolveScopes(
  requestedScopes: readonly string[] | undefined,
  allowedScopes: readonly string[] | undefined,
): string[] | CodeDebugCaptureStateResult {
  const requested = cleanList(requestedScopes);
  const allowed = cleanList(allowedScopes);

  if (requested.length === 0) {
    return [];
  }

  const denied = requested.filter((scope) => !allowed.includes(scope));
  if (denied.length > 0) {
    return failure("SCOPE_DENIED", `debug capture scope ${denied[0]} is outside runtime governance`, "scope");
  }

  return requested;
}

function normalizeCaptureOptions(capture: CodeDebugCaptureOptions | undefined): Required<CodeDebugCaptureOptions> {
  return {
    includeStack: capture?.includeStack ?? true,
    includeVariables: capture?.includeVariables ?? false,
    includeBreakpoints: capture?.includeBreakpoints ?? true,
    maxVariables: capture?.maxVariables ?? 0,
  };
}

export function planCodeDebugCaptureState(
  request?: CodeDebugCaptureStateRequest,
): CodeDebugCaptureStateResult {
  if (request === undefined || isBlank(request.runtimeId)) {
    return failure("MISSING_RUNTIME_ID", "code.debugCaptureState requires runtimeId", "input");
  }

  if (isBlank(request.sessionId)) {
    return failure("MISSING_SESSION_ID", "code.debugCaptureState requires sessionId", "input");
  }

  if (request.target === undefined || request.target.kind === undefined) {
    return failure("MISSING_TARGET", "code.debugCaptureState requires a target kind", "input");
  }

  if (isBlank(request.target.id)) {
    return failure("MISSING_TARGET_ID", "code.debugCaptureState requires a target id", "input");
  }

  if (request.capture?.maxVariables !== undefined && request.capture.maxVariables < 0) {
    return failure("INVALID_CAPTURE_LIMIT", "code.debugCaptureState maxVariables cannot be negative", "input");
  }

  if (request.dryRun === false) {
    return failure(
      "REAL_DEBUG_CAPTURE_NOT_ALLOWED",
      "first-round code.debugCaptureState only plans a dry-run capture envelope",
      "governance",
    );
  }

  if (request.contract?.accepted === false) {
    return failure(
      "CONTRACT_REJECTED",
      request.contract.reason ?? "code.debugCaptureState was rejected by contract surface",
      "contract",
    );
  }

  if (request.governance?.accepted === false) {
    return failure(
      "GOVERNANCE_REJECTED",
      request.governance.reason ?? "code.debugCaptureState was rejected by runtime governance",
      "governance",
    );
  }

  const acceptedScopes = resolveScopes(request.requestedScopes, request.allowedScopes);
  if (!Array.isArray(acceptedScopes)) {
    return acceptedScopes;
  }

  const runtimeId = (request.runtimeId ?? "").trim();
  const sessionId = request.sessionId?.trim() ?? "";
  const invocationId = request.invocationId?.trim() || `${runtimeId}:${sessionId}:code.debugCaptureState`;
  const targetId = request.target.id?.trim() ?? "";
  const capture = normalizeCaptureOptions(request.capture);

  const storage = planBaseToolStorageWrite({
    runtimeId,
    sessionId,
    invocationId,
    records: [
      {
        id: `${invocationId}:state-plan`,
        kind: "runtime-material",
        toolName: "code.debugCaptureState",
        invocationId,
        reuseKey: `debug-state:${request.target.kind}:${targetId}`,
        tags: ["code", "debug", "capture-state"],
        payload: {
          targetKind: request.target.kind,
          targetId,
          capture,
          acceptedScopes,
        },
      },
    ],
  });

  if (!storage.ok) {
    return failure("STORAGE_PLAN_REJECTED", storage.error.message, "storage");
  }

  return {
    ok: true,
    plan: {
      toolName: "code.debugCaptureState",
      runtimeId,
      sessionId,
      invocationId,
      target: {
        kind: request.target.kind,
        id: targetId,
        cwd: request.target.cwd?.trim() || undefined,
      },
      permissions: ["debug:read"],
      capture,
      execution: {
        dryRun: true,
        captured: false,
        unsafeSideEffects: false,
      },
      audit: {
        governanceRequired: true,
        tapHandoffReady: true,
      },
      storage: storage.plan,
    },
    events: ["agentCore.basicTool.code.debugCaptureState.planned", ...storage.events],
  };
}
