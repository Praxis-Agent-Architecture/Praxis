export type MicrophoneSelectBoundary = "input" | "contract" | "governance" | "scope" | "resource" | "provider";

export type MicrophoneSelectGate = {
  accepted?: boolean;
  allowed?: boolean;
  reason?: string;
};

export type MicrophoneAccessBoundary = MicrophoneSelectBoundary;

export type MicrophoneAccessGate = MicrophoneSelectGate;

export type MicrophoneSelectableDeviceKind = "integrated" | "usb" | "virtual" | "unknown";

export type MicrophoneSelectableDevice = {
  id: string;
  label?: string;
  kind?: MicrophoneSelectableDeviceKind;
};

export type MicrophoneSelectContext = {
  runtimeId?: string;
  sessionId?: string;
  invocationId?: string;
  dryRun?: boolean;
  guard?: MicrophoneSelectGate;
  contract?: MicrophoneSelectGate;
  governance?: MicrophoneSelectGate;
  requestedScopes?: readonly string[];
  allowedScopes?: readonly string[];
  auditMetadata?: Readonly<Record<string, unknown>>;
};

export type MicrophoneSelectTarget = {
  deviceId: string;
  targetApplication: string;
  permissionLeaseId?: string;
  selectionReason?: string;
  availableDevices?: readonly MicrophoneSelectableDevice[];
};

export type MicrophoneSelectProviderRequest = {
  operation: "computeruse.microphoneSelect.select";
  target: MicrophoneSelectTarget;
  context: {
    runtimeId?: string;
    sessionId?: string;
    invocationId?: string;
    auditMetadata?: Readonly<Record<string, unknown>>;
  };
};

export type MicrophoneSelectProviderResult = {
  selected: boolean;
  deviceId: string;
  metadata?: Readonly<Record<string, unknown>>;
};

export type MicrophoneSelectProvider = (
  request: MicrophoneSelectProviderRequest,
) => Promise<MicrophoneSelectProviderResult> | MicrophoneSelectProviderResult;

export type MicrophoneSelectRequest = {
  target?: unknown;
  context?: unknown;
  deviceId?: unknown;
  targetApplication?: unknown;
  permissionLeaseId?: unknown;
  selectionReason?: unknown;
  availableDevices?: unknown;
  metadata?: unknown;
  provider?: MicrophoneSelectProvider;
};

export type MicrophoneSelectErrorCode =
  | "INVALID_REQUEST"
  | "INVALID_CONTEXT"
  | "INVALID_TARGET"
  | "MISSING_RUNTIME_ID"
  | "MISSING_MICROPHONE_DEVICE"
  | "MISSING_TARGET_APPLICATION"
  | "INVALID_MICROPHONE_DEVICE"
  | "INVALID_TARGET_APPLICATION"
  | "INVALID_PERMISSION_LEASE"
  | "INVALID_SELECTION_REASON"
  | "MICROPHONE_DEVICE_NOT_AVAILABLE"
  | "CONTRACT_REJECTED"
  | "GOVERNANCE_REJECTED"
  | "SCOPE_DENIED"
  | "PROVIDER_UNAVAILABLE"
  | "PROVIDER_FAILURE";

export type MicrophoneSelectError = {
  code: MicrophoneSelectErrorCode;
  message: string;
  boundary: MicrophoneSelectBoundary;
  publicSafe: true;
  safeForRuntimeInspection: true;
  internalDetailExposed: false;
};

export type MicrophoneSelectAuditEvent = {
  type: string;
  toolId: "computeruse.microphoneSelect";
  invocationId: string;
  dryRun: boolean;
  deviceId?: string;
  metadata: Readonly<Record<string, unknown>>;
};

export type MicrophoneSelectOutput = {
  kind: "agentCore.basicTool.computeruse.microphoneSelect";
  target: MicrophoneSelectTarget;
  dispatch: "dry-run" | "runtime-computeruse";
  dryRun: boolean;
  providerCalled: boolean;
  executionBlocked: boolean;
  unsafeSideEffects: true;
  permissionsRequired: readonly ["microphone:select"];
  requiresTapApproval: true;
  acceptedScopes: readonly string[];
  runtimeEntry: {
    port: "BaseToolExecutorPort.computeruse.selectDevice";
    operation: "computeruse.microphoneSelect.select";
    runtimeOwnsDeviceSelection: true;
    runtimeOwnsPermissionLease: true;
    baseToolOwnsTapStrategy: false;
  };
  selectionEnvelope: {
    resource: "microphone";
    requested: boolean;
    selected: boolean;
    metadataOnly: boolean;
    deviceId: string;
    permissionLeaseId?: string;
  };
  providerMetadata?: Readonly<Record<string, unknown>>;
};

export type MicrophoneSelectResult =
  | {
      ok: true;
      toolId: "computeruse.microphoneSelect";
      output: MicrophoneSelectOutput;
      audit: readonly MicrophoneSelectAuditEvent[];
      events: readonly string[];
    }
  | {
      ok: false;
      toolId: "computeruse.microphoneSelect";
      error: MicrophoneSelectError;
      audit: readonly MicrophoneSelectAuditEvent[];
      events: readonly string[];
    };

export const microphoneSelectDescriptor = {
  toolId: "computeruse.microphoneSelect",
  capability: "microphone-device-select",
  route: "agent_executionEngine.basic_toolLayer.baseTools.computeruseBase.microphoneAccess",
  defaultDryRun: true,
  tapOwnsApproval: true,
  runtimeEntry: "BaseToolExecutorPort.computeruse.selectDevice",
  permissionsRequired: ["microphone:select"],
  unsafeSideEffects: true,
} as const;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function cleanString(value: unknown, maxLength = 256): string | undefined {
  return typeof value === "string" && value.trim().length > 0 && value.trim().length <= maxLength && !value.includes("\0")
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

function cleanGate(value: unknown): MicrophoneSelectGate | undefined {
  if (value === undefined) return undefined;
  if (!isRecord(value)) return undefined;
  const gate: MicrophoneSelectGate = {};
  if (typeof value.accepted === "boolean") gate.accepted = value.accepted;
  if (typeof value.allowed === "boolean") gate.allowed = value.allowed;
  const reason = cleanString(value.reason);
  if (reason !== undefined) gate.reason = reason;
  return gate;
}

function cleanAuditMetadata(value: unknown): Readonly<Record<string, unknown>> | undefined {
  return isRecord(value) ? value : undefined;
}

function cleanDeviceKind(value: unknown): MicrophoneSelectableDeviceKind {
  return value === "integrated" || value === "usb" || value === "virtual" || value === "unknown" ? value : "unknown";
}

function cleanAvailableDevices(value: unknown): readonly MicrophoneSelectableDevice[] | undefined {
  if (value === undefined) return undefined;
  if (!Array.isArray(value)) return undefined;
  const devices: MicrophoneSelectableDevice[] = [];
  for (const item of value) {
    if (!isRecord(item)) return undefined;
    const id = cleanString(item.id, 128);
    if (id === undefined) return undefined;
    const label = cleanString(item.label, 256);
    devices.push({
      id,
      ...(label === undefined ? {} : { label }),
      kind: cleanDeviceKind(item.kind),
    });
  }
  return devices;
}

function auditEvent(
  type: string,
  context: MicrophoneSelectContext | undefined,
  deviceId: string | undefined,
  metadata?: Readonly<Record<string, unknown>>,
): MicrophoneSelectAuditEvent {
  return {
    type,
    toolId: microphoneSelectDescriptor.toolId,
    invocationId: context?.invocationId ?? "computeruse.microphoneSelect:dry-run",
    dryRun: context?.dryRun !== false,
    deviceId,
    metadata: {
      ...(context?.auditMetadata ?? {}),
      ...(metadata ?? {}),
    },
  };
}

function failure(
  code: MicrophoneSelectErrorCode,
  message: string,
  boundary: MicrophoneSelectBoundary,
  context: MicrophoneSelectContext | undefined,
  deviceId?: string,
): MicrophoneSelectResult {
  return {
    ok: false,
    toolId: microphoneSelectDescriptor.toolId,
    error: {
      code,
      message,
      boundary,
      publicSafe: true,
      safeForRuntimeInspection: true,
      internalDetailExposed: false,
    },
    audit: [auditEvent("basicTool.computeruse.microphoneSelect.rejected", context, deviceId, { code, boundary })],
    events: ["basicTool.computeruse.microphoneSelect.rejected"],
  };
}

function cleanContext(value: unknown): MicrophoneSelectContext | "invalid" | undefined {
  if (value === undefined) return undefined;
  if (!isRecord(value)) return "invalid";
  return {
    runtimeId: cleanString(value.runtimeId, 128),
    sessionId: cleanString(value.sessionId, 128),
    invocationId: cleanString(value.invocationId, 128),
    dryRun: typeof value.dryRun === "boolean" ? value.dryRun : undefined,
    guard: cleanGate(value.guard),
    contract: cleanGate(value.contract),
    governance: cleanGate(value.governance),
    requestedScopes: cleanStringList(value.requestedScopes),
    allowedScopes: cleanStringList(value.allowedScopes),
    auditMetadata: cleanAuditMetadata(value.auditMetadata),
  };
}

function cleanTarget(request: Record<string, unknown>): MicrophoneSelectTarget | "invalid" {
  const source = request.target;
  const targetRecord = source === undefined ? request : isRecord(source) ? source : undefined;
  if (targetRecord === undefined) return "invalid";

  const deviceId = cleanString(targetRecord.deviceId ?? request.deviceId, 128);
  const targetApplication = cleanString(targetRecord.targetApplication ?? request.targetApplication, 256);
  const permissionLeaseId = cleanString(targetRecord.permissionLeaseId ?? request.permissionLeaseId, 512);
  const selectionReason = cleanString(targetRecord.selectionReason ?? request.selectionReason, 512);
  const availableDevices = cleanAvailableDevices(targetRecord.availableDevices ?? request.availableDevices);

  if (deviceId === undefined) return "invalid";
  if (targetApplication === undefined) return "invalid";
  if ((targetRecord.availableDevices ?? request.availableDevices) !== undefined && availableDevices === undefined) return "invalid";

  return {
    deviceId,
    targetApplication,
    ...(permissionLeaseId === undefined ? {} : { permissionLeaseId }),
    ...(selectionReason === undefined ? {} : { selectionReason }),
    ...(availableDevices === undefined ? {} : { availableDevices }),
  };
}

function resolveScopes(context: MicrophoneSelectContext | undefined): readonly string[] | MicrophoneSelectResult {
  const requested = context?.requestedScopes ?? [];
  const allowed = context?.allowedScopes ?? [];
  if (requested.length === 0) return [];
  const denied = requested.filter((scope) => !allowed.includes(scope));
  if (denied.length > 0) {
    return failure(
      "SCOPE_DENIED",
      `computeruse.microphoneSelect scope ${denied[0]} is outside runtime governance`,
      "scope",
      context,
    );
  }
  return requested;
}

function isScopeFailure(value: readonly string[] | MicrophoneSelectResult): value is MicrophoneSelectResult {
  return !Array.isArray(value);
}

function guardAccepted(context: MicrophoneSelectContext | undefined): boolean {
  return context?.guard?.accepted === true || context?.guard?.allowed === true;
}

function buildOutput(
  target: MicrophoneSelectTarget,
  context: MicrophoneSelectContext,
  acceptedScopes: readonly string[],
  providerResult?: MicrophoneSelectProviderResult,
): MicrophoneSelectOutput {
  const dryRun = context.dryRun !== false;
  return {
    kind: "agentCore.basicTool.computeruse.microphoneSelect",
    target,
    dispatch: dryRun ? "dry-run" : "runtime-computeruse",
    dryRun,
    providerCalled: !dryRun,
    executionBlocked: false,
    unsafeSideEffects: true,
    permissionsRequired: ["microphone:select"],
    requiresTapApproval: true,
    acceptedScopes,
    runtimeEntry: {
      port: "BaseToolExecutorPort.computeruse.selectDevice",
      operation: "computeruse.microphoneSelect.select",
      runtimeOwnsDeviceSelection: true,
      runtimeOwnsPermissionLease: true,
      baseToolOwnsTapStrategy: false,
    },
    selectionEnvelope: {
      resource: "microphone",
      requested: !dryRun,
      selected: providerResult?.selected ?? false,
      metadataOnly: dryRun,
      deviceId: providerResult?.deviceId ?? target.deviceId,
      ...(target.permissionLeaseId === undefined ? {} : { permissionLeaseId: target.permissionLeaseId }),
    },
    providerMetadata: providerResult?.metadata,
  };
}

export async function executeMicrophoneSelect(request: MicrophoneSelectRequest = {}): Promise<MicrophoneSelectResult> {
  if (!isRecord(request)) {
    return failure("INVALID_REQUEST", "computeruse.microphoneSelect expects a JSON object request", "input", undefined);
  }

  const context = cleanContext(request.context);
  if (context === "invalid") {
    return failure("INVALID_CONTEXT", "computeruse.microphoneSelect context must be a JSON object", "input", undefined);
  }
  const normalizedContext = context ?? {};

  const target = cleanTarget(request);
  if (target === "invalid") {
    if (request.target !== undefined && !isRecord(request.target)) {
      return failure("INVALID_TARGET", "computeruse.microphoneSelect target must be a JSON object", "input", normalizedContext);
    }
    const rawDevice = isRecord(request.target) ? request.target.deviceId : request.deviceId;
    const rawApplication = isRecord(request.target) ? request.target.targetApplication : request.targetApplication;
    const hasDevice = rawDevice !== undefined;
    const hasApplication = rawApplication !== undefined;
    if (!hasDevice) {
      return failure("MISSING_MICROPHONE_DEVICE", "computeruse.microphoneSelect requires target.deviceId", "input", normalizedContext);
    }
    if (!hasApplication) {
      return failure("MISSING_TARGET_APPLICATION", "computeruse.microphoneSelect requires target.targetApplication", "input", normalizedContext);
    }
    if (cleanString(rawApplication, 256) === undefined) {
      return failure("INVALID_TARGET_APPLICATION", "targetApplication must be a bounded string", "input", normalizedContext);
    }
    return failure("INVALID_MICROPHONE_DEVICE", "microphone device selection fields must be bounded JSON values", "input", normalizedContext);
  }

  if (normalizedContext.runtimeId === undefined) {
    return failure(
      "MISSING_RUNTIME_ID",
      "computeruse.microphoneSelect requires context.runtimeId for audit correlation",
      "input",
      normalizedContext,
      target.deviceId,
    );
  }

  const rawTarget = isRecord(request.target) ? request.target : request;
  if ((rawTarget.permissionLeaseId ?? request.permissionLeaseId) !== undefined && target.permissionLeaseId === undefined) {
    return failure("INVALID_PERMISSION_LEASE", "permissionLeaseId must be a bounded opaque identifier", "input", normalizedContext, target.deviceId);
  }
  if ((rawTarget.selectionReason ?? request.selectionReason) !== undefined && target.selectionReason === undefined) {
    return failure("INVALID_SELECTION_REASON", "selectionReason must be a bounded string", "input", normalizedContext, target.deviceId);
  }

  if (target.availableDevices !== undefined && !target.availableDevices.some((device) => device.id === target.deviceId)) {
    return failure(
      "MICROPHONE_DEVICE_NOT_AVAILABLE",
      "computeruse.microphoneSelect can only select an injected available microphone device",
      "resource",
      normalizedContext,
      target.deviceId,
    );
  }

  if (normalizedContext.contract?.accepted === false || normalizedContext.contract?.allowed === false) {
    return failure(
      "CONTRACT_REJECTED",
      normalizedContext.contract.reason ?? "microphone selection was rejected by runtime contract surface",
      "contract",
      normalizedContext,
      target.deviceId,
    );
  }
  if (normalizedContext.governance?.accepted === false || normalizedContext.governance?.allowed === false) {
    return failure(
      "GOVERNANCE_REJECTED",
      normalizedContext.governance.reason ?? "microphone selection was rejected by runtime governance",
      "governance",
      normalizedContext,
      target.deviceId,
    );
  }

  const acceptedScopes = resolveScopes(normalizedContext);
  if (isScopeFailure(acceptedScopes)) return acceptedScopes;

  if (normalizedContext.dryRun !== false) {
    return {
      ok: true,
      toolId: microphoneSelectDescriptor.toolId,
      output: buildOutput(target, normalizedContext, acceptedScopes),
      audit: [auditEvent("basicTool.computeruse.microphoneSelect.planned", normalizedContext, target.deviceId)],
      events: ["basicTool.computeruse.microphoneSelect.planned"],
    };
  }

  if (!guardAccepted(normalizedContext)) {
    return failure(
      "GOVERNANCE_REJECTED",
      "computeruse.microphoneSelect dryRun:false requires an affirmative runtime guard",
      "governance",
      normalizedContext,
      target.deviceId,
    );
  }

  if (request.provider === undefined) {
    return failure(
      "PROVIDER_UNAVAILABLE",
      "computeruse.microphoneSelect requires executor.computeruse.selectDevice for real execution",
      "provider",
      normalizedContext,
      target.deviceId,
    );
  }

  try {
    const providerResult = await request.provider({
      operation: "computeruse.microphoneSelect.select",
      target,
      context: {
        runtimeId: normalizedContext.runtimeId,
        sessionId: normalizedContext.sessionId,
        invocationId: normalizedContext.invocationId,
        auditMetadata: normalizedContext.auditMetadata,
      },
    });
    if (!providerResult.selected || providerResult.deviceId.trim() !== target.deviceId) {
      return failure(
        "PROVIDER_FAILURE",
        "computeruse.microphoneSelect provider returned an invalid selection result",
        "provider",
        normalizedContext,
        target.deviceId,
      );
    }
    return {
      ok: true,
      toolId: microphoneSelectDescriptor.toolId,
      output: buildOutput(target, normalizedContext, acceptedScopes, providerResult),
      audit: [auditEvent("basicTool.computeruse.microphoneSelect.selected", normalizedContext, target.deviceId, providerResult.metadata)],
      events: ["basicTool.computeruse.microphoneSelect.selected"],
    };
  } catch {
    return failure(
      "PROVIDER_FAILURE",
      "computeruse.microphoneSelect provider failed before returning a public-safe result",
      "provider",
      normalizedContext,
      target.deviceId,
    );
  }
}

export function planMicrophoneSelect(request: unknown = {}): Promise<MicrophoneSelectResult> {
  if (!isRecord(request)) return executeMicrophoneSelect(request as MicrophoneSelectRequest);
  if (request.context !== undefined && !isRecord(request.context)) return executeMicrophoneSelect(request as MicrophoneSelectRequest);
  return executeMicrophoneSelect({ ...request, context: { ...(isRecord(request.context) ? request.context : {}), dryRun: true } });
}
