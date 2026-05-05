export type CameraSelectBoundary = "input" | "contract" | "governance" | "scope" | "resource" | "provider";

export type CameraSelectGate = {
  accepted?: boolean;
  allowed?: boolean;
  reason?: string;
};

export type CameraSelectableDeviceKind = "integrated" | "usb" | "virtual" | "unknown";

export type CameraSelectContext = {
  runtimeId?: string;
  sessionId?: string;
  invocationId?: string;
  dryRun?: boolean;
  guard?: CameraSelectGate;
  contract?: CameraSelectGate;
  governance?: CameraSelectGate;
  requestedScopes?: readonly string[];
  allowedScopes?: readonly string[];
  auditMetadata?: Readonly<Record<string, unknown>>;
};

export type CameraSelectableDevice = {
  id: string;
  label?: string;
  kind: CameraSelectableDeviceKind;
};

export type CameraSelectTarget = {
  deviceId: string;
  availableDevices?: readonly CameraSelectableDevice[];
  purpose?: string;
};

export type CameraSelectProviderRequest = {
  operation: "computeruse.cameraSelect.select";
  target: CameraSelectTarget;
  context: {
    runtimeId?: string;
    sessionId?: string;
    invocationId?: string;
    auditMetadata?: Readonly<Record<string, unknown>>;
  };
};

export type CameraSelectProviderResult = {
  selected: boolean;
  deviceId: string;
  metadata?: Readonly<Record<string, unknown>>;
};

export type CameraSelectProvider = (
  request: CameraSelectProviderRequest,
) => Promise<CameraSelectProviderResult> | CameraSelectProviderResult;

export type CameraSelectInput = {
  target?: unknown;
  context?: unknown;
  deviceId?: unknown;
  availableDevices?: unknown;
  purpose?: unknown;
  metadata?: unknown;
  provider?: CameraSelectProvider;
};

export type CameraSelectErrorCode =
  | "INVALID_REQUEST"
  | "INVALID_CONTEXT"
  | "INVALID_TARGET"
  | "MISSING_RUNTIME_ID"
  | "MISSING_CAMERA_DEVICE"
  | "INVALID_CAMERA_DEVICE"
  | "INVALID_AVAILABLE_DEVICES"
  | "CAMERA_DEVICE_NOT_AVAILABLE"
  | "CONTRACT_REJECTED"
  | "GOVERNANCE_REJECTED"
  | "SCOPE_DENIED"
  | "PROVIDER_UNAVAILABLE"
  | "PROVIDER_FAILURE";

export type CameraSelectError = {
  code: CameraSelectErrorCode;
  message: string;
  boundary: CameraSelectBoundary;
  publicSafe: true;
  safeForRuntimeInspection: true;
  internalDetailExposed: false;
};

export type CameraSelectAuditEvent = {
  type: string;
  toolId: "computeruse.cameraSelect";
  invocationId: string;
  dryRun: boolean;
  deviceId?: string;
  metadata: Readonly<Record<string, unknown>>;
};

export type CameraSelectOutput = {
  kind: "agentCore.basicTool.computeruse.cameraSelect";
  target: CameraSelectTarget;
  dispatch: "dry-run" | "runtime-computeruse";
  dryRun: boolean;
  providerCalled: boolean;
  executionBlocked: boolean;
  unsafeSideEffects: true;
  permissionsRequired: readonly ["camera:select"];
  requiresTapApproval: true;
  acceptedScopes: readonly string[];
  runtimeEntry: {
    port: "BaseToolExecutorPort.computeruse.selectDevice";
    operation: "computeruse.cameraSelect.select";
    runtimeOwnsDeviceInventory: true;
    runtimeOwnsDevicePolicy: true;
    baseToolOwnsTapStrategy: false;
  };
  selectionEnvelope: {
    resource: "camera";
    requested: boolean;
    selected: boolean;
    metadataOnly: boolean;
    deviceId: string;
  };
  providerMetadata?: Readonly<Record<string, unknown>>;
};

export type CameraSelectResult =
  | {
      ok: true;
      toolId: "computeruse.cameraSelect";
      output: CameraSelectOutput;
      audit: readonly CameraSelectAuditEvent[];
      events: readonly string[];
    }
  | {
      ok: false;
      toolId: "computeruse.cameraSelect";
      error: CameraSelectError;
      audit: readonly CameraSelectAuditEvent[];
      events: readonly string[];
    };

export const cameraSelectDescriptor = {
  toolId: "computeruse.cameraSelect",
  capability: "select-camera-device",
  route: "agent_executionEngine.basic_toolLayer.baseTools.computeruseBase.cameraAccess",
  defaultDryRun: true,
  tapOwnsApproval: true,
  runtimeEntry: "BaseToolExecutorPort.computeruse.selectDevice",
  permissionsRequired: ["camera:select"],
  unsafeSideEffects: true,
} as const;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function cleanString(value: unknown, maxLength = 256): string | undefined {
  return typeof value === "string" && value.trim().length > 0 && !value.includes("\0") && value.trim().length <= maxLength
    ? value.trim()
    : undefined;
}

function cleanStringList(value: unknown): readonly string[] | undefined {
  if (value === undefined) return undefined;
  if (!Array.isArray(value)) return undefined;
  const cleaned: string[] = [];
  for (const item of value) {
    const text = cleanString(item);
    if (text === undefined) return undefined;
    if (!cleaned.includes(text)) cleaned.push(text);
  }
  return cleaned;
}

function cleanGate(value: unknown): CameraSelectGate | undefined {
  if (value === undefined) return undefined;
  if (!isRecord(value)) return undefined;
  const gate: CameraSelectGate = {};
  if (typeof value.accepted === "boolean") gate.accepted = value.accepted;
  if (typeof value.allowed === "boolean") gate.allowed = value.allowed;
  const reason = cleanString(value.reason);
  if (reason !== undefined) gate.reason = reason;
  return gate;
}

function cleanAuditMetadata(value: unknown): Readonly<Record<string, unknown>> | undefined {
  return isRecord(value) ? value : undefined;
}

function cleanDeviceKind(value: unknown): CameraSelectableDeviceKind {
  return value === "integrated" || value === "usb" || value === "virtual" || value === "unknown" ? value : "unknown";
}

function cleanAvailableDevices(value: unknown): readonly CameraSelectableDevice[] | undefined {
  if (value === undefined) return undefined;
  if (!Array.isArray(value)) return undefined;
  const devices: CameraSelectableDevice[] = [];
  for (const item of value) {
    if (!isRecord(item)) return undefined;
    const id = cleanString(item.id, 128);
    if (id === undefined) return undefined;
    devices.push({
      id,
      label: cleanString(item.label),
      kind: cleanDeviceKind(item.kind),
    });
  }
  return devices;
}

function auditEvent(
  type: string,
  context: CameraSelectContext | undefined,
  deviceId: string | undefined,
  metadata?: Readonly<Record<string, unknown>>,
): CameraSelectAuditEvent {
  return {
    type,
    toolId: cameraSelectDescriptor.toolId,
    invocationId: context?.invocationId ?? "computeruse.cameraSelect:dry-run",
    dryRun: context?.dryRun !== false,
    deviceId,
    metadata: {
      ...(context?.auditMetadata ?? {}),
      ...(metadata ?? {}),
    },
  };
}

function failure(
  code: CameraSelectErrorCode,
  message: string,
  boundary: CameraSelectBoundary,
  context: CameraSelectContext | undefined,
  deviceId?: string,
): CameraSelectResult {
  return {
    ok: false,
    toolId: cameraSelectDescriptor.toolId,
    error: {
      code,
      message,
      boundary,
      publicSafe: true,
      safeForRuntimeInspection: true,
      internalDetailExposed: false,
    },
    audit: [auditEvent("agentCore.basicTool.computeruse.cameraSelect.rejected", context, deviceId, { code })],
    events: ["basicTool.computeruse.cameraSelect.rejected"],
  };
}

function normalizeContext(value: unknown): CameraSelectContext | CameraSelectResult {
  if (value === undefined) return {};
  if (!isRecord(value)) return failure("INVALID_CONTEXT", "computeruse.cameraSelect context must be an object", "input", undefined);

  const requestedScopes = cleanStringList(value.requestedScopes);
  const allowedScopes = cleanStringList(value.allowedScopes);
  const guard = cleanGate(value.guard);
  const contract = cleanGate(value.contract);
  const governance = cleanGate(value.governance);

  if (
    (value.requestedScopes !== undefined && requestedScopes === undefined) ||
    (value.allowedScopes !== undefined && allowedScopes === undefined) ||
    (value.guard !== undefined && guard === undefined) ||
    (value.contract !== undefined && contract === undefined) ||
    (value.governance !== undefined && governance === undefined) ||
    (value.dryRun !== undefined && typeof value.dryRun !== "boolean")
  ) {
    return failure("INVALID_CONTEXT", "computeruse.cameraSelect context contains malformed guard, governance, or scope fields", "input", undefined);
  }

  return {
    runtimeId: cleanString(value.runtimeId),
    sessionId: cleanString(value.sessionId),
    invocationId: cleanString(value.invocationId),
    dryRun: typeof value.dryRun === "boolean" ? value.dryRun : undefined,
    guard,
    contract,
    governance,
    requestedScopes,
    allowedScopes,
    auditMetadata: cleanAuditMetadata(value.auditMetadata),
  };
}

function normalizeTarget(request: Record<string, unknown>, context: CameraSelectContext): CameraSelectTarget | CameraSelectResult {
  const targetValue = request.target;
  if (targetValue !== undefined && !isRecord(targetValue)) {
    return failure("INVALID_TARGET", "computeruse.cameraSelect target must be an object when provided", "input", context);
  }
  const target = isRecord(targetValue) ? targetValue : {};
  const deviceId = cleanString(target.deviceId ?? request.deviceId, 128);
  const purpose = cleanString(target.purpose ?? request.purpose);
  const availableDevices = cleanAvailableDevices(target.availableDevices ?? request.availableDevices);

  if (deviceId === undefined) {
    return failure(
      (target.deviceId ?? request.deviceId) === undefined ? "MISSING_CAMERA_DEVICE" : "INVALID_CAMERA_DEVICE",
      "computeruse.cameraSelect requires a bounded camera deviceId",
      "input",
      context,
    );
  }
  if ((target.availableDevices ?? request.availableDevices) !== undefined && availableDevices === undefined) {
    return failure("INVALID_AVAILABLE_DEVICES", "computeruse.cameraSelect availableDevices must be bounded camera device records", "input", context, deviceId);
  }
  if (availableDevices !== undefined && availableDevices.length > 0 && !availableDevices.some((device) => device.id === deviceId)) {
    return failure("CAMERA_DEVICE_NOT_AVAILABLE", "computeruse.cameraSelect can only select a camera present in availableDevices", "resource", context, deviceId);
  }

  return {
    deviceId,
    availableDevices,
    purpose,
  };
}

function ensureScopes(target: CameraSelectTarget, context: CameraSelectContext): CameraSelectResult | undefined {
  const requested = context.requestedScopes ?? [];
  const allowed = context.allowedScopes ?? [];
  if (requested.length === 0) return undefined;

  const denied = requested.filter((scope) => !allowed.includes(scope));
  if (denied.length === 0) return undefined;

  return failure("SCOPE_DENIED", `computeruse.cameraSelect scope ${denied[0]} is outside runtime governance`, "scope", context, target.deviceId);
}

function ensureStaticGates(target: CameraSelectTarget, context: CameraSelectContext): CameraSelectResult | undefined {
  if (context.contract?.accepted === false || context.contract?.allowed === false) {
    return failure(
      "CONTRACT_REJECTED",
      context.contract.reason ?? "computeruse.cameraSelect was rejected by runtime contract surface",
      "contract",
      context,
      target.deviceId,
    );
  }
  if (context.governance?.accepted === false || context.governance?.allowed === false) {
    return failure(
      "GOVERNANCE_REJECTED",
      context.governance.reason ?? "computeruse.cameraSelect was rejected by runtime governance",
      "governance",
      context,
      target.deviceId,
    );
  }
  return undefined;
}

function ensureRealExecutionGuard(target: CameraSelectTarget, context: CameraSelectContext): CameraSelectResult | undefined {
  if (context.dryRun !== false) return undefined;
  if (context.guard?.accepted === true || context.guard?.allowed === true) return undefined;
  return failure(
    "GOVERNANCE_REJECTED",
    context.guard?.reason ?? "computeruse.cameraSelect dryRun:false requires an affirmative runtime guard",
    "governance",
    context,
    target.deviceId,
  );
}

function baseOutput(
  target: CameraSelectTarget,
  acceptedScopes: readonly string[],
  dryRun: boolean,
  providerCalled: boolean,
): Omit<CameraSelectOutput, "selectionEnvelope"> {
  return {
    kind: "agentCore.basicTool.computeruse.cameraSelect",
    target,
    dispatch: dryRun ? "dry-run" : "runtime-computeruse",
    dryRun,
    providerCalled,
    executionBlocked: dryRun,
    unsafeSideEffects: true,
    permissionsRequired: cameraSelectDescriptor.permissionsRequired,
    requiresTapApproval: true,
    acceptedScopes,
    runtimeEntry: {
      port: "BaseToolExecutorPort.computeruse.selectDevice",
      operation: "computeruse.cameraSelect.select",
      runtimeOwnsDeviceInventory: true,
      runtimeOwnsDevicePolicy: true,
      baseToolOwnsTapStrategy: false,
    },
  };
}

function normalizeProviderResult(value: unknown, context: CameraSelectContext, target: CameraSelectTarget): CameraSelectProviderResult | CameraSelectResult {
  if (!isRecord(value) || typeof value.selected !== "boolean") {
    return failure("PROVIDER_FAILURE", "computeruse.cameraSelect runtime provider returned a malformed public-safe selection envelope", "provider", context, target.deviceId);
  }
  const deviceId = cleanString(value.deviceId, 128);
  if (deviceId === undefined) {
    return failure("PROVIDER_FAILURE", "computeruse.cameraSelect runtime provider returned an invalid selected device id", "provider", context, target.deviceId);
  }
  return {
    selected: value.selected,
    deviceId,
    metadata: cleanAuditMetadata(value.metadata),
  };
}

function normalizeRequest(request: unknown): {
  target: CameraSelectTarget;
  context: CameraSelectContext;
  metadata?: Readonly<Record<string, unknown>>;
  provider?: CameraSelectProvider;
} | CameraSelectResult {
  if (request === undefined) request = {};
  if (!isRecord(request)) {
    return failure("INVALID_REQUEST", "computeruse.cameraSelect request must be an object", "input", undefined);
  }

  const context = normalizeContext(request.context);
  if ("ok" in context) return context;

  const target = normalizeTarget(request, context);
  if ("ok" in target) return target;

  if (context.runtimeId === undefined) {
    return failure("MISSING_RUNTIME_ID", "computeruse.cameraSelect requires context.runtimeId for audit", "input", context, target.deviceId);
  }

  const scopes = ensureScopes(target, context);
  if (scopes !== undefined) return scopes;

  const staticGates = ensureStaticGates(target, context);
  if (staticGates !== undefined) return staticGates;

  const realGuard = ensureRealExecutionGuard(target, context);
  if (realGuard !== undefined) return realGuard;

  return {
    target,
    context,
    metadata: cleanAuditMetadata(request.metadata),
    provider: typeof request.provider === "function" ? (request.provider as CameraSelectProvider) : undefined,
  };
}

export async function executeCameraSelect(request: unknown = {}): Promise<CameraSelectResult> {
  const normalized = normalizeRequest(request);
  if ("ok" in normalized) return normalized;

  const { target, context, metadata, provider } = normalized;
  const acceptedScopes = context.requestedScopes ?? [];
  const dryRun = context.dryRun !== false;

  if (dryRun) {
    return {
      ok: true,
      toolId: cameraSelectDescriptor.toolId,
      output: {
        ...baseOutput(target, acceptedScopes, true, false),
        selectionEnvelope: {
          resource: "camera",
          requested: false,
          selected: false,
          metadataOnly: true,
          deviceId: target.deviceId,
        },
      },
      audit: [auditEvent("agentCore.basicTool.computeruse.cameraSelect.dryRun", context, target.deviceId, metadata)],
      events: ["basicTool.computeruse.cameraSelect.dryRun"],
    };
  }

  if (provider === undefined) {
    return failure("PROVIDER_UNAVAILABLE", "computeruse.cameraSelect requires runtime executor.computeruse.selectDevice for dryRun:false", "provider", context, target.deviceId);
  }

  let providerResult: CameraSelectProviderResult;
  try {
    const result = await provider({
      operation: "computeruse.cameraSelect.select",
      target,
      context: {
        runtimeId: context.runtimeId,
        sessionId: context.sessionId,
        invocationId: context.invocationId,
        auditMetadata: {
          ...(context.auditMetadata ?? {}),
          ...(metadata ?? {}),
        },
      },
    });
    const normalizedResult = normalizeProviderResult(result, context, target);
    if ("ok" in normalizedResult) return normalizedResult;
    providerResult = normalizedResult;
  } catch {
    return failure("PROVIDER_FAILURE", "computeruse.cameraSelect runtime provider failed without exposing private details", "provider", context, target.deviceId);
  }

  return {
    ok: true,
    toolId: cameraSelectDescriptor.toolId,
    output: {
      ...baseOutput(target, acceptedScopes, false, true),
      selectionEnvelope: {
        resource: "camera",
        requested: true,
        selected: providerResult.selected,
        metadataOnly: false,
        deviceId: providerResult.deviceId,
      },
      providerMetadata: providerResult.metadata,
    },
    audit: [auditEvent("agentCore.basicTool.computeruse.cameraSelect.selected", context, target.deviceId, providerResult.metadata)],
    events: ["basicTool.computeruse.cameraSelect.selected"],
  };
}

export const planCameraSelect = executeCameraSelect;
