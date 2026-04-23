/*
 * 文件定位：Agent 执行引擎 / 基础工具原语层 / 基础工具集合 / 计算机使用基础工具 / 摄像头访问。
 * 核心目的：提供 计算机使用基础工具 / 摄像头访问 中的“选择摄像头设备”基础能力原语。
 * 能力要求1：需要定义该能力的输入、输出、错误、权限需求和可观测事件。
 * 能力要求2：这些基础工具是 Agent 成立的底层能力，不是 TAP 的最终高级工具库。
 * 能力要求3：后续 TAP 可以基于这些原语构建更强的工具编排、审批、替换和专业能力库。
 * 边界：保留 Agent 基础工具原语，不替代 TAP 的高级工具系统。
 * 对接：需要被 runtime.execEngine 拉起，并和 mainLoop、stateEngine、事件暴露、工具调用策略接通。
 * 实现提示：先补稳定类型契约、最小可测行为和清晰错误边界，再接入真实执行逻辑。
 */

import type { CameraAccessAuditRecord, CameraAccessBoundary, CameraAccessGate } from "./computeruse.cameraPermissionRequest.js";

export type CameraSelectableDevice = {
  id: string;
  label?: string;
  kind?: "integrated" | "usb" | "virtual" | "unknown";
};

export type CameraSelectInput = {
  runtimeId?: string;
  sessionId?: string;
  deviceId?: string;
  availableDevices?: readonly CameraSelectableDevice[];
  requestedScopes?: readonly string[];
  allowedScopes?: readonly string[];
  dryRun?: boolean;
  contract?: CameraAccessGate;
  governance?: CameraAccessGate;
  metadata?: Readonly<Record<string, unknown>>;
};

export type CameraSelectErrorCode =
  | "MISSING_RUNTIME_ID"
  | "MISSING_CAMERA_DEVICE"
  | "INVALID_CAMERA_DEVICE"
  | "CAMERA_DEVICE_NOT_AVAILABLE"
  | "CONTRACT_REJECTED"
  | "GOVERNANCE_REJECTED"
  | "SCOPE_DENIED"
  | "REAL_CAMERA_SELECTION_NOT_ALLOWED";

export type CameraSelectError = {
  code: CameraSelectErrorCode;
  message: string;
  boundary: CameraAccessBoundary;
  safeForRuntimeInspection: true;
  internalDetailExposed: false;
};

export type CameraSelectPlan = {
  toolName: "computeruse.cameraSelect";
  capability: "select-camera-device";
  runtimeId: string;
  sessionId?: string;
  target: {
    deviceId: string;
    availableDeviceCount?: number;
  };
  requiredPermission: "camera:select";
  requiresTapApproval: true;
  acceptedScopes: readonly string[];
  execution: {
    dispatch: "dry-run";
    dryRun: true;
    cameraSelectionPlanned: true;
    cameraSelected: false;
    realCameraTouched: false;
    unsafeSideEffects: false;
  };
  audit: CameraAccessAuditRecord;
};

export type CameraSelectResult =
  | {
      ok: true;
      plan: CameraSelectPlan;
      events: readonly string[];
    }
  | {
      ok: false;
      error: CameraSelectError;
      events: readonly string[];
    };

export const cameraSelectDescriptor = {
  toolName: "computeruse.cameraSelect",
  capability: "select-camera-device",
  layer: "agent_executionEngine.basic_toolLayer.baseTools.computeruseBase.cameraAccess",
  defaultDispatch: "dry-run",
  requiredPermission: "camera:select",
  requiresTapApproval: true,
  unsafeSideEffects: false,
} as const;

function isBlank(value: string | undefined): boolean {
  return typeof value !== "string" || value.trim().length === 0;
}

function cleanList(values: readonly string[] | undefined): string[] {
  return [...new Set((values ?? []).map((value) => value.trim()).filter(Boolean))];
}

function failure(code: CameraSelectErrorCode, message: string, boundary: CameraAccessBoundary): CameraSelectResult {
  return {
    ok: false,
    error: {
      code,
      message,
      boundary,
      safeForRuntimeInspection: true,
      internalDetailExposed: false,
    },
    events: ["basicTool.computeruse.cameraSelect.rejected"],
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

function normalizeAvailableDevice(device: CameraSelectableDevice): CameraSelectableDevice | undefined {
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
): string[] | CameraSelectResult {
  const requested = cleanList(requestedScopes);
  const allowed = cleanList(allowedScopes);

  if (requested.length === 0) {
    return [];
  }

  const denied = requested.filter((scope) => !allowed.includes(scope));
  if (denied.length > 0) {
    return failure(
      "SCOPE_DENIED",
      `computeruse.cameraSelect scope ${denied[0]} is outside runtime governance`,
      "scope",
    );
  }

  return requested;
}

export function planCameraSelect(request: CameraSelectInput = {}): CameraSelectResult {
  if (isBlank(request.runtimeId)) {
    return failure("MISSING_RUNTIME_ID", "computeruse.cameraSelect requires a runtimeId for audit correlation", "input");
  }

  const deviceId = normalizeDeviceId(request.deviceId);
  if (deviceId === undefined) {
    return failure("MISSING_CAMERA_DEVICE", "computeruse.cameraSelect requires a bounded camera deviceId", "input");
  }
  if (deviceId === "invalid") {
    return failure("INVALID_CAMERA_DEVICE", "camera deviceId must be a bounded opaque identifier", "input");
  }

  const availableDevices = (request.availableDevices ?? [])
    .map((device) => normalizeAvailableDevice(device))
    .filter((device): device is CameraSelectableDevice => device !== undefined);

  if (request.availableDevices !== undefined && availableDevices.length !== request.availableDevices.length) {
    return failure("INVALID_CAMERA_DEVICE", "available camera devices must have bounded opaque ids", "input");
  }

  if (availableDevices.length > 0 && !availableDevices.some((device) => device.id === deviceId)) {
    return failure(
      "CAMERA_DEVICE_NOT_AVAILABLE",
      "computeruse.cameraSelect can only plan selection for an injected available device",
      "resource",
    );
  }

  if (request.dryRun === false) {
    return failure(
      "REAL_CAMERA_SELECTION_NOT_ALLOWED",
      "first-round computeruse.cameraSelect only supports dry-run planning",
      "governance",
    );
  }

  if (request.contract?.accepted === false) {
    return failure(
      "CONTRACT_REJECTED",
      request.contract.reason ?? "camera selection was rejected by runtime contract surface",
      "contract",
    );
  }

  if (request.governance?.accepted === false) {
    return failure(
      "GOVERNANCE_REJECTED",
      request.governance.reason ?? "camera selection was rejected by runtime governance",
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
      toolName: "computeruse.cameraSelect",
      capability: "select-camera-device",
      runtimeId: request.runtimeId?.trim() ?? "",
      sessionId: request.sessionId?.trim() || undefined,
      target: {
        deviceId,
        availableDeviceCount: request.availableDevices === undefined ? undefined : availableDevices.length,
      },
      requiredPermission: "camera:select",
      requiresTapApproval: true,
      acceptedScopes,
      execution: {
        dispatch: "dry-run",
        dryRun: true,
        cameraSelectionPlanned: true,
        cameraSelected: false,
        realCameraTouched: false,
        unsafeSideEffects: false,
      },
      audit: {
        guard: "device-inventory-contract-governance-and-scope",
        event: "basicTool.computeruse.cameraSelect.planned",
        metadata: request.metadata ?? {},
      },
    },
    events: ["basicTool.computeruse.cameraSelect.planned"],
  };
}
