/*
 * 文件定位：Agent 执行引擎 / 基础工具原语层 / 基础工具集合 / 计算机使用基础工具 / 麦克风访问。
 * 核心目的：提供 计算机使用基础工具 / 麦克风访问 中的“选择麦克风设备”基础能力原语。
 * 能力要求1：需要定义该能力的输入、输出、错误、权限需求和可观测事件。
 * 能力要求2：这些基础工具是 Agent 成立的底层能力，不是 TAP 的最终高级工具库。
 * 能力要求3：后续 TAP 可以基于这些原语构建更强的工具编排、审批、替换和专业能力库。
 * 边界：保留 Agent 基础工具原语，不替代 TAP 的高级工具系统。
 * 对接：需要被 runtime.execEngine 拉起，并和 mainLoop、stateEngine、事件暴露、工具调用策略接通。
 * 实现提示：先补稳定类型契约、最小可测行为和清晰错误边界，再接入真实执行逻辑。
 */

export type MicrophoneAccessBoundary = "input" | "contract" | "governance" | "scope" | "resource";

export type MicrophoneAccessGate = {
  accepted: boolean;
  reason?: string;
};

export type MicrophoneAccessAuditRecord = {
  guard: string;
  event: string;
  metadata: Readonly<Record<string, unknown>>;
};

export type MicrophoneSelectableDevice = {
  id: string;
  label?: string;
  kind?: "integrated" | "usb" | "virtual" | "unknown";
};

export type MicrophoneSelectInput = {
  runtimeId?: string;
  sessionId?: string;
  deviceId?: string;
  availableDevices?: readonly MicrophoneSelectableDevice[];
  requestedScopes?: readonly string[];
  allowedScopes?: readonly string[];
  dryRun?: boolean;
  contract?: MicrophoneAccessGate;
  governance?: MicrophoneAccessGate;
  metadata?: Readonly<Record<string, unknown>>;
};

export type MicrophoneSelectErrorCode =
  | "MISSING_RUNTIME_ID"
  | "MISSING_MICROPHONE_DEVICE"
  | "INVALID_MICROPHONE_DEVICE"
  | "MICROPHONE_DEVICE_NOT_AVAILABLE"
  | "CONTRACT_REJECTED"
  | "GOVERNANCE_REJECTED"
  | "SCOPE_DENIED"
  | "REAL_MICROPHONE_SELECTION_NOT_ALLOWED";

export type MicrophoneSelectError = {
  code: MicrophoneSelectErrorCode;
  message: string;
  boundary: MicrophoneAccessBoundary;
  safeForRuntimeInspection: true;
  internalDetailExposed: false;
};

export type MicrophoneSelectPlan = {
  toolName: "computeruse.microphoneSelect";
  capability: "select-microphone-device";
  runtimeId: string;
  sessionId?: string;
  target: {
    deviceId: string;
    availableDeviceCount?: number;
  };
  requiredPermission: "microphone:select";
  requiresTapApproval: true;
  acceptedScopes: readonly string[];
  execution: {
    dispatch: "dry-run";
    dryRun: true;
    microphoneSelectionPlanned: true;
    microphoneSelected: false;
    realMicrophoneTouched: false;
    unsafeSideEffects: false;
  };
  audit: MicrophoneAccessAuditRecord;
};

export type MicrophoneSelectResult =
  | {
      ok: true;
      plan: MicrophoneSelectPlan;
      events: readonly string[];
    }
  | {
      ok: false;
      error: MicrophoneSelectError;
      events: readonly string[];
    };

export const microphoneSelectDescriptor = {
  toolName: "computeruse.microphoneSelect",
  capability: "select-microphone-device",
  layer: "agent_executionEngine.basic_toolLayer.baseTools.computeruseBase.microphoneAccess",
  defaultDispatch: "dry-run",
  requiredPermission: "microphone:select",
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
  code: MicrophoneSelectErrorCode,
  message: string,
  boundary: MicrophoneAccessBoundary,
): MicrophoneSelectResult {
  return {
    ok: false,
    error: {
      code,
      message,
      boundary,
      safeForRuntimeInspection: true,
      internalDetailExposed: false,
    },
    events: ["basicTool.computeruse.microphoneSelect.rejected"],
  };
}

function normalizeDeviceId(value: string | undefined): string | undefined | "invalid" {
  if (value === undefined || value.trim().length === 0) {
    return undefined;
  }

  const normalized = value.trim();
  if (normalized.includes("\0") || normalized.length > 128) {
    return "invalid";
  }

  return normalized;
}

function normalizeAvailableDevice(device: MicrophoneSelectableDevice): MicrophoneSelectableDevice | undefined {
  const id = normalizeDeviceId(device.id);
  if (id === undefined || id === "invalid") {
    return undefined;
  }

  return {
    id,
    label: device.label?.trim() || undefined,
    kind: device.kind ?? "unknown",
  };
}

function resolveScopes(
  requestedScopes: readonly string[] | undefined,
  allowedScopes: readonly string[] | undefined,
): string[] | MicrophoneSelectResult {
  const requested = cleanList(requestedScopes);
  const allowed = cleanList(allowedScopes);

  if (requested.length === 0) {
    return [];
  }

  const denied = requested.filter((scope) => !allowed.includes(scope));
  if (denied.length > 0) {
    return failure(
      "SCOPE_DENIED",
      `computeruse.microphoneSelect scope ${denied[0]} is outside runtime governance`,
      "scope",
    );
  }

  return requested;
}

export function planMicrophoneSelect(request: MicrophoneSelectInput = {}): MicrophoneSelectResult {
  if (isBlank(request.runtimeId)) {
    return failure(
      "MISSING_RUNTIME_ID",
      "computeruse.microphoneSelect requires a runtimeId for audit correlation",
      "input",
    );
  }

  const deviceId = normalizeDeviceId(request.deviceId);
  if (deviceId === undefined) {
    return failure("MISSING_MICROPHONE_DEVICE", "computeruse.microphoneSelect requires a deviceId", "input");
  }
  if (deviceId === "invalid") {
    return failure("INVALID_MICROPHONE_DEVICE", "microphone deviceId must be a bounded opaque identifier", "input");
  }

  const availableDevices = (request.availableDevices ?? [])
    .map((device) => normalizeAvailableDevice(device))
    .filter((device): device is MicrophoneSelectableDevice => device !== undefined);

  if (request.availableDevices !== undefined && availableDevices.length !== request.availableDevices.length) {
    return failure("INVALID_MICROPHONE_DEVICE", "available microphone devices must have bounded opaque ids", "input");
  }

  if (availableDevices.length > 0 && !availableDevices.some((device) => device.id === deviceId)) {
    return failure(
      "MICROPHONE_DEVICE_NOT_AVAILABLE",
      "computeruse.microphoneSelect can only plan selection for an injected available device",
      "resource",
    );
  }

  if (request.dryRun === false) {
    return failure(
      "REAL_MICROPHONE_SELECTION_NOT_ALLOWED",
      "first-round computeruse.microphoneSelect only supports dry-run planning",
      "governance",
    );
  }

  if (request.contract?.accepted === false) {
    return failure(
      "CONTRACT_REJECTED",
      request.contract.reason ?? "microphone selection was rejected by runtime contract surface",
      "contract",
    );
  }

  if (request.governance?.accepted === false) {
    return failure(
      "GOVERNANCE_REJECTED",
      request.governance.reason ?? "microphone selection was rejected by runtime governance",
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
      toolName: "computeruse.microphoneSelect",
      capability: "select-microphone-device",
      runtimeId: request.runtimeId?.trim() ?? "",
      sessionId: request.sessionId?.trim() || undefined,
      target: {
        deviceId,
        availableDeviceCount: request.availableDevices === undefined ? undefined : availableDevices.length,
      },
      requiredPermission: "microphone:select",
      requiresTapApproval: true,
      acceptedScopes,
      execution: {
        dispatch: "dry-run",
        dryRun: true,
        microphoneSelectionPlanned: true,
        microphoneSelected: false,
        realMicrophoneTouched: false,
        unsafeSideEffects: false,
      },
      audit: {
        guard: "device-inventory-contract-governance-and-scope",
        event: "basicTool.computeruse.microphoneSelect.planned",
        metadata: request.metadata ?? {},
      },
    },
    events: ["basicTool.computeruse.microphoneSelect.planned"],
  };
}
