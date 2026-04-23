/*
 * 文件定位：Agent 执行引擎 / 基础工具原语层 / 基础工具集合 / 计算机使用基础工具 / 麦克风访问。
 * 核心目的：提供 计算机使用基础工具 / 麦克风访问 中的“申请麦克风权限”基础能力原语。
 * 能力要求1：需要定义该能力的输入、输出、错误、权限需求和可观测事件。
 * 能力要求2：这些基础工具是 Agent 成立的底层能力，不是 TAP 的最终高级工具库。
 * 能力要求3：后续 TAP 可以基于这些原语构建更强的工具编排、审批、替换和专业能力库。
 * 边界：保留 Agent 基础工具原语，不替代 TAP 的高级工具系统。
 * 对接：需要被 runtime.execEngine 拉起，并和 mainLoop、stateEngine、事件暴露、工具调用策略接通。
 * 实现提示：先补稳定类型契约、最小可测行为和清晰错误边界，再接入真实执行逻辑。
 */

export type MicrophonePermissionRequestBoundary = "input" | "contract" | "governance" | "scope" | "resource";

export type MicrophonePermissionRequestGate = {
  accepted: boolean;
  reason?: string;
};

export type MicrophonePermissionRequestMode = "session" | "single-capture" | "recording";

export type MicrophonePermissionRequestInput = {
  runtimeId?: string;
  sessionId?: string;
  invocationId?: string;
  targetApplication?: string;
  purpose?: string;
  deviceId?: string;
  mode?: MicrophonePermissionRequestMode;
  requestedDurationMs?: number;
  maxDurationMs?: number;
  requestedScopes?: readonly string[];
  allowedScopes?: readonly string[];
  dryRun?: boolean;
  contract?: MicrophonePermissionRequestGate;
  governance?: MicrophonePermissionRequestGate;
  metadata?: Readonly<Record<string, unknown>>;
};

export type MicrophonePermissionRequestErrorCode =
  | "MISSING_TARGET_APPLICATION"
  | "MISSING_PURPOSE"
  | "INVALID_DURATION"
  | "DURATION_LIMIT_EXCEEDED"
  | "CONTRACT_REJECTED"
  | "GOVERNANCE_REJECTED"
  | "SCOPE_DENIED"
  | "REAL_SIDE_EFFECT_NOT_ALLOWED";

export type MicrophonePermissionRequestError = {
  code: MicrophonePermissionRequestErrorCode;
  message: string;
  boundary: MicrophonePermissionRequestBoundary;
  safeForRuntimeInspection: true;
  internalDetailExposed: false;
};

export type MicrophonePermissionRequestPlan = {
  tool: "computeruse.microphonePermissionRequest";
  capability: "microphone-permission-request";
  runtimeId?: string;
  sessionId?: string;
  invocationId?: string;
  targetApplication: string;
  purpose: string;
  deviceId?: string;
  mode: MicrophonePermissionRequestMode;
  requestedDurationMs: number;
  requiredPermission: "microphone:permission-request";
  requiresTapApproval: true;
  dispatch: "dry-run";
  dryRun: true;
  wouldRequestPermission: true;
  unsafeSideEffects: false;
  acceptedScopes: readonly string[];
  audit: {
    guard: "microphone-permission-request-dry-run-and-scope";
    event: "basicTool.computeruse.microphonePermissionRequest.planned";
    metadata: Readonly<Record<string, unknown>>;
  };
};

export type MicrophonePermissionRequestResult =
  | {
      ok: true;
      plan: MicrophonePermissionRequestPlan;
      events: readonly string[];
    }
  | {
      ok: false;
      error: MicrophonePermissionRequestError;
      events: readonly string[];
    };

export const microphonePermissionRequestDescriptor = {
  tool: "computeruse.microphonePermissionRequest",
  capability: "microphone-permission-request",
  layer: "agent_executionEngine.basic_toolLayer.baseTools.computeruseBase.microphoneAccess",
  defaultDispatch: "dry-run",
  requiresTapApproval: true,
  unsafeSideEffects: false,
} as const;

const defaultRequestedDurationMs = 60_000;
const defaultMaxDurationMs = 10 * 60_000;

function isBlank(value: string | undefined): boolean {
  return typeof value !== "string" || value.trim().length === 0;
}

function cleanList(values: readonly string[] | undefined): string[] {
  return [...new Set((values ?? []).map((value) => value.trim()).filter(Boolean))];
}

function failure(
  code: MicrophonePermissionRequestErrorCode,
  message: string,
  boundary: MicrophonePermissionRequestBoundary,
): MicrophonePermissionRequestResult {
  return {
    ok: false,
    error: {
      code,
      message,
      boundary,
      safeForRuntimeInspection: true,
      internalDetailExposed: false,
    },
    events: ["basicTool.computeruse.microphonePermissionRequest.rejected"],
  };
}

function resolveScopes(
  requestedScopes: readonly string[] | undefined,
  allowedScopes: readonly string[] | undefined,
): string[] | MicrophonePermissionRequestResult {
  const requested = cleanList(requestedScopes);
  const allowed = cleanList(allowedScopes);

  if (requested.length === 0) {
    return [];
  }

  const denied = requested.filter((scope) => !allowed.includes(scope));
  if (denied.length > 0) {
    return failure(
      "SCOPE_DENIED",
      `microphone permission request scope ${denied[0]} is outside runtime governance`,
      "scope",
    );
  }

  return requested;
}

export function planMicrophonePermissionRequest(
  request: MicrophonePermissionRequestInput = {},
): MicrophonePermissionRequestResult {
  if (isBlank(request.targetApplication)) {
    return failure(
      "MISSING_TARGET_APPLICATION",
      "microphone permission request requires a targetApplication",
      "input",
    );
  }

  if (isBlank(request.purpose)) {
    return failure("MISSING_PURPOSE", "microphone permission request requires a purpose", "input");
  }

  const requestedDurationMs = request.requestedDurationMs ?? defaultRequestedDurationMs;
  const maxDurationMs = request.maxDurationMs ?? defaultMaxDurationMs;
  if (
    !Number.isInteger(requestedDurationMs) ||
    requestedDurationMs < 1 ||
    !Number.isInteger(maxDurationMs) ||
    maxDurationMs < 1
  ) {
    return failure("INVALID_DURATION", "microphone permission request durations must be positive integers", "input");
  }

  if (requestedDurationMs > maxDurationMs) {
    return failure(
      "DURATION_LIMIT_EXCEEDED",
      "microphone permission request duration exceeds the configured resource boundary",
      "resource",
    );
  }

  if (request.dryRun === false) {
    return failure(
      "REAL_SIDE_EFFECT_NOT_ALLOWED",
      "first-round microphone permission request only returns a dry-run plan",
      "governance",
    );
  }

  if (request.contract?.accepted === false) {
    return failure(
      "CONTRACT_REJECTED",
      request.contract.reason ?? "microphone permission request was rejected by runtime contract surface",
      "contract",
    );
  }

  if (request.governance?.accepted === false) {
    return failure(
      "GOVERNANCE_REJECTED",
      request.governance.reason ?? "microphone permission request was rejected by runtime governance",
      "governance",
    );
  }

  const acceptedScopes = resolveScopes(request.requestedScopes, request.allowedScopes);
  if (!Array.isArray(acceptedScopes)) {
    return acceptedScopes;
  }

  return {
    ok: true,
    plan: {
      tool: "computeruse.microphonePermissionRequest",
      capability: "microphone-permission-request",
      runtimeId: request.runtimeId?.trim() || undefined,
      sessionId: request.sessionId?.trim() || undefined,
      invocationId: request.invocationId?.trim() || undefined,
      targetApplication: request.targetApplication?.trim() ?? "",
      purpose: request.purpose?.trim() ?? "",
      deviceId: request.deviceId?.trim() || undefined,
      mode: request.mode ?? "session",
      requestedDurationMs,
      requiredPermission: "microphone:permission-request",
      requiresTapApproval: true,
      dispatch: "dry-run",
      dryRun: true,
      wouldRequestPermission: true,
      unsafeSideEffects: false,
      acceptedScopes,
      audit: {
        guard: "microphone-permission-request-dry-run-and-scope",
        event: "basicTool.computeruse.microphonePermissionRequest.planned",
        metadata: request.metadata ?? {},
      },
    },
    events: ["basicTool.computeruse.microphonePermissionRequest.planned"],
  };
}
