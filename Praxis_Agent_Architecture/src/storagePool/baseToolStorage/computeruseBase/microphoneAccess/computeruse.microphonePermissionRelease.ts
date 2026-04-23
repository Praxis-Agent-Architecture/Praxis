/*
 * 文件定位：Agent 执行引擎 / 基础工具原语层 / 基础工具集合 / 计算机使用基础工具 / 麦克风访问。
 * 核心目的：提供 计算机使用基础工具 / 麦克风访问 中的“释放麦克风权限”基础能力原语。
 * 能力要求1：需要定义该能力的输入、输出、错误、权限需求和可观测事件。
 * 能力要求2：这些基础工具是 Agent 成立的底层能力，不是 TAP 的最终高级工具库。
 * 能力要求3：后续 TAP 可以基于这些原语构建更强的工具编排、审批、替换和专业能力库。
 * 边界：保留 Agent 基础工具原语，不替代 TAP 的高级工具系统。
 * 对接：需要被 runtime.execEngine 拉起，并和 mainLoop、stateEngine、事件暴露、工具调用策略接通。
 * 实现提示：先补稳定类型契约、最小可测行为和清晰错误边界，再接入真实执行逻辑。
 */

export type MicrophonePermissionReleaseBoundary = "input" | "contract" | "governance" | "scope";

export type MicrophonePermissionReleaseGate = {
  accepted: boolean;
  reason?: string;
};

export type MicrophonePermissionReleaseRequest = {
  runtimeId?: string;
  sessionId?: string;
  invocationId?: string;
  permissionLeaseId?: string;
  targetApplication?: string;
  releaseReason?: string;
  requestedScopes?: readonly string[];
  allowedScopes?: readonly string[];
  dryRun?: boolean;
  contract?: MicrophonePermissionReleaseGate;
  governance?: MicrophonePermissionReleaseGate;
  metadata?: Readonly<Record<string, unknown>>;
};

export type MicrophonePermissionReleaseErrorCode =
  | "MISSING_PERMISSION_LEASE"
  | "MISSING_TARGET_APPLICATION"
  | "CONTRACT_REJECTED"
  | "GOVERNANCE_REJECTED"
  | "SCOPE_DENIED"
  | "REAL_SIDE_EFFECT_NOT_ALLOWED";

export type MicrophonePermissionReleaseError = {
  code: MicrophonePermissionReleaseErrorCode;
  message: string;
  boundary: MicrophonePermissionReleaseBoundary;
  safeForRuntimeInspection: true;
  internalDetailExposed: false;
};

export type MicrophonePermissionReleasePlan = {
  tool: "computeruse.microphonePermissionRelease";
  capability: "microphone-permission-release";
  runtimeId?: string;
  sessionId?: string;
  invocationId?: string;
  permissionLeaseId: string;
  targetApplication: string;
  releaseReason?: string;
  requiredPermission: "microphone:permission-release";
  requiresTapApproval: true;
  dispatch: "dry-run";
  dryRun: true;
  wouldRelease: true;
  unsafeSideEffects: false;
  acceptedScopes: readonly string[];
  audit: {
    guard: "microphone-permission-release-dry-run-and-scope";
    event: "basicTool.computeruse.microphonePermissionRelease.planned";
    metadata: Readonly<Record<string, unknown>>;
  };
};

export type MicrophonePermissionReleaseResult =
  | {
      ok: true;
      plan: MicrophonePermissionReleasePlan;
      events: readonly string[];
    }
  | {
      ok: false;
      error: MicrophonePermissionReleaseError;
      events: readonly string[];
    };

export const microphonePermissionReleaseDescriptor = {
  tool: "computeruse.microphonePermissionRelease",
  capability: "microphone-permission-release",
  layer: "agent_executionEngine.basic_toolLayer.baseTools.computeruseBase.microphoneAccess",
  defaultDispatch: "dry-run",
  requiresTapApproval: true,
  unsafeSideEffects: false,
} as const;

function isBlank(value: string | undefined): boolean {
  return typeof value !== "string" || value.trim().length === 0;
}

function cleanList(values: readonly string[] | undefined): string[] {
  return [...new Set((values ?? []).map((value) => value.trim()).filter(Boolean))];
}

function failure(
  code: MicrophonePermissionReleaseErrorCode,
  message: string,
  boundary: MicrophonePermissionReleaseBoundary,
): MicrophonePermissionReleaseResult {
  return {
    ok: false,
    error: {
      code,
      message,
      boundary,
      safeForRuntimeInspection: true,
      internalDetailExposed: false,
    },
    events: ["basicTool.computeruse.microphonePermissionRelease.rejected"],
  };
}

function resolveScopes(
  requestedScopes: readonly string[] | undefined,
  allowedScopes: readonly string[] | undefined,
): string[] | MicrophonePermissionReleaseResult {
  const requested = cleanList(requestedScopes);
  const allowed = cleanList(allowedScopes);

  if (requested.length === 0) {
    return [];
  }

  const denied = requested.filter((scope) => !allowed.includes(scope));
  if (denied.length > 0) {
    return failure(
      "SCOPE_DENIED",
      `microphone permission release scope ${denied[0]} is outside runtime governance`,
      "scope",
    );
  }

  return requested;
}

export function planMicrophonePermissionRelease(
  request: MicrophonePermissionReleaseRequest = {},
): MicrophonePermissionReleaseResult {
  if (isBlank(request.permissionLeaseId)) {
    return failure("MISSING_PERMISSION_LEASE", "microphone permission release requires a permissionLeaseId", "input");
  }

  if (isBlank(request.targetApplication)) {
    return failure(
      "MISSING_TARGET_APPLICATION",
      "microphone permission release requires the targetApplication being released",
      "input",
    );
  }

  if (request.dryRun === false) {
    return failure(
      "REAL_SIDE_EFFECT_NOT_ALLOWED",
      "first-round microphone permission release only returns a dry-run plan",
      "governance",
    );
  }

  if (request.contract?.accepted === false) {
    return failure(
      "CONTRACT_REJECTED",
      request.contract.reason ?? "microphone permission release was rejected by runtime contract surface",
      "contract",
    );
  }

  if (request.governance?.accepted === false) {
    return failure(
      "GOVERNANCE_REJECTED",
      request.governance.reason ?? "microphone permission release was rejected by runtime governance",
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
      tool: "computeruse.microphonePermissionRelease",
      capability: "microphone-permission-release",
      runtimeId: request.runtimeId?.trim() || undefined,
      sessionId: request.sessionId?.trim() || undefined,
      invocationId: request.invocationId?.trim() || undefined,
      permissionLeaseId: request.permissionLeaseId?.trim() ?? "",
      targetApplication: request.targetApplication?.trim() ?? "",
      releaseReason: request.releaseReason?.trim() || undefined,
      requiredPermission: "microphone:permission-release",
      requiresTapApproval: true,
      dispatch: "dry-run",
      dryRun: true,
      wouldRelease: true,
      unsafeSideEffects: false,
      acceptedScopes,
      audit: {
        guard: "microphone-permission-release-dry-run-and-scope",
        event: "basicTool.computeruse.microphonePermissionRelease.planned",
        metadata: request.metadata ?? {},
      },
    },
    events: ["basicTool.computeruse.microphonePermissionRelease.planned"],
  };
}
