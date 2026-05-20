/*
 * 文件定位：Agent 模型适配层 / 真实上游调用层 / 非官方/自定义上游格式。
 * 核心目的：接收自定义上游格式传入或配置出的能力说明。
 * 能力要求1：需要把外部不规范能力描述先收拢成可检查对象。
 * 能力要求2：后续再交给能力映射和兼容核心判断是否能进入 agentCore。
 * 边界：只处理上游实际调用面，不在这里定义 agentCore 使用 AI 的统一方式。
 * 对接：需要被 runtime.modelAdapter 拉起，并和 provider/carrier、PromptPack lowering、能力抽象链路接通。
 * 实现提示：先补稳定类型契约、最小可测行为和清晰错误边界，再接入真实执行逻辑。
 */

export type CustomFormatCapabilityBoundary = "input" | "contract" | "governance" | "provider-config";

export type CustomFormatCapabilityGate = {
  accepted: boolean;
  reason?: string;
};

export type CustomFormatCapabilityTrace = {
  correlationId?: string;
  callerId?: string;
  source?: string;
};

export type CustomFormatCapabilityClaimInput = {
  providerId?: string;
  endpointId?: string;
  capabilityId?: string;
  label?: string;
  description?: string;
  inputChannels?: readonly string[];
  outputChannels?: readonly string[];
  toolUse?: boolean;
  streaming?: boolean;
  fileExchange?: boolean;
  contextWindowTokens?: number;
  raw?: Readonly<Record<string, unknown>>;
  metadata?: Readonly<Record<string, unknown>>;
  trace?: CustomFormatCapabilityTrace;
  contract?: CustomFormatCapabilityGate;
  governance?: CustomFormatCapabilityGate;
};

export type CustomFormatCapabilityFeatureFlags = {
  toolUse: boolean;
  streaming: boolean;
  fileExchange: boolean;
  contextWindowTokens?: number;
};

export type CustomFormatReceivedCapability = {
  providerId: string;
  endpointId: string;
  capabilityId: string;
  label: string;
  description?: string;
  inputChannels: readonly string[];
  outputChannels: readonly string[];
  featureFlags: CustomFormatCapabilityFeatureFlags;
  rawEnvelope: {
    retained: false;
    keyHints: readonly string[];
  };
  metadata: Readonly<Record<string, unknown>>;
  trace: CustomFormatCapabilityTrace;
  audit: {
    receivedBy: "customFormat.capabilityReceiver";
    dryRun: true;
    unsafeSideEffects: false;
    rawProviderFieldsExposed: false;
    next: "capabilityDefiner";
  };
};

export type CustomFormatCapabilityReceiveErrorCode =
  | "MISSING_PROVIDER_ID"
  | "MISSING_ENDPOINT_ID"
  | "MISSING_CAPABILITY_ID"
  | "MISSING_CAPABILITY_SIGNAL"
  | "INVALID_CONTEXT_WINDOW"
  | "INVALID_RAW_ENVELOPE"
  | "CONTRACT_REJECTED"
  | "GOVERNANCE_REJECTED";

export type CustomFormatCapabilityReceiveError = {
  code: CustomFormatCapabilityReceiveErrorCode;
  message: string;
  boundary: CustomFormatCapabilityBoundary;
  safeForRuntimeInspection: true;
  rawProviderFieldsExposed: false;
};

export type CustomFormatCapabilityReceiveResult =
  | {
      ok: true;
      capability: CustomFormatReceivedCapability;
      events: readonly string[];
    }
  | {
      ok: false;
      error: CustomFormatCapabilityReceiveError;
      events: readonly string[];
    };

export const customFormatCapabilityReceiverDescriptor = {
  layer: "agent_modelAdapter.actualInvocationLayer.customFormat",
  capability: "customFormat.capabilityReceiver",
  purpose: "receive an external custom provider capability description into an inspection-safe envelope",
  dryRun: true,
  unsafeSideEffects: false,
  rawProviderFieldsExposed: false,
} as const;

function cleanText(value: string | undefined): string | undefined {
  const cleaned = value?.trim();
  return cleaned === undefined || cleaned.length === 0 ? undefined : cleaned;
}

function cleanList(values: readonly string[] | undefined): readonly string[] {
  return [...new Set((values ?? []).map((value) => value.trim()).filter(Boolean))].sort();
}

function isRecord(value: unknown): value is Readonly<Record<string, unknown>> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function failure(
  code: CustomFormatCapabilityReceiveErrorCode,
  message: string,
  boundary: CustomFormatCapabilityBoundary,
): CustomFormatCapabilityReceiveResult {
  return {
    ok: false,
    error: { code, message, boundary, safeForRuntimeInspection: true, rawProviderFieldsExposed: false },
    events: ["customFormat.capability.receive.rejected"],
  };
}

function hasCapabilitySignal(request: CustomFormatCapabilityClaimInput): boolean {
  return (
    cleanList(request.inputChannels).length > 0 ||
    cleanList(request.outputChannels).length > 0 ||
    request.toolUse === true ||
    request.streaming === true ||
    request.fileExchange === true ||
    request.contextWindowTokens !== undefined
  );
}

export function receiveCustomFormatCapability(
  request?: CustomFormatCapabilityClaimInput,
): CustomFormatCapabilityReceiveResult {
  const providerId = request?.providerId?.trim();
  const endpointId = request?.endpointId?.trim();
  const capabilityId = request?.capabilityId?.trim();

  if (request === undefined || providerId === undefined || providerId.length === 0) {
    return failure("MISSING_PROVIDER_ID", "customFormat capability receiver requires providerId", "input");
  }

  if (endpointId === undefined || endpointId.length === 0) {
    return failure("MISSING_ENDPOINT_ID", "customFormat capability receiver requires endpointId", "input");
  }

  if (capabilityId === undefined || capabilityId.length === 0) {
    return failure("MISSING_CAPABILITY_ID", "customFormat capability receiver requires capabilityId", "input");
  }

  if (!hasCapabilitySignal(request)) {
    return failure(
      "MISSING_CAPABILITY_SIGNAL",
      "customFormat capability receiver requires at least one input, output, tool, stream, file, or context signal",
      "input",
    );
  }

  if (
    request.contextWindowTokens !== undefined &&
    (!Number.isSafeInteger(request.contextWindowTokens) || request.contextWindowTokens <= 0)
  ) {
    return failure(
      "INVALID_CONTEXT_WINDOW",
      "customFormat contextWindowTokens must be a positive safe integer when provided",
      "provider-config",
    );
  }

  if (request.raw !== undefined && !isRecord(request.raw)) {
    return failure("INVALID_RAW_ENVELOPE", "customFormat raw capability material must be a plain record", "input");
  }

  if (request.contract?.accepted === false) {
    return failure(
      "CONTRACT_REJECTED",
      request.contract.reason ?? "runtime contract surface rejected the customFormat capability",
      "contract",
    );
  }

  if (request.governance?.accepted === false) {
    return failure(
      "GOVERNANCE_REJECTED",
      request.governance.reason ?? "runtime governance rejected the customFormat capability",
      "governance",
    );
  }

  const inputChannels = cleanList(request.inputChannels);
  const outputChannels = cleanList(request.outputChannels);

  return {
    ok: true,
    capability: {
      providerId,
      endpointId,
      capabilityId,
      label: cleanText(request.label) ?? capabilityId,
      description: cleanText(request.description),
      inputChannels,
      outputChannels,
      featureFlags: {
        toolUse: request.toolUse === true,
        streaming: request.streaming === true,
        fileExchange: request.fileExchange === true,
        contextWindowTokens: request.contextWindowTokens,
      },
      rawEnvelope: {
        retained: false,
        keyHints: Object.keys(request.raw ?? {}).sort(),
      },
      metadata: request.metadata ?? {},
      trace: {
        correlationId: cleanText(request.trace?.correlationId),
        callerId: cleanText(request.trace?.callerId),
        source: cleanText(request.trace?.source),
      },
      audit: {
        receivedBy: "customFormat.capabilityReceiver",
        dryRun: true,
        unsafeSideEffects: false,
        rawProviderFieldsExposed: false,
        next: "capabilityDefiner",
      },
    },
    events: ["customFormat.capability.received"],
  };
}
