/*
 * 文件定位：Agent 模型适配层 / 真实上游调用层 / 非官方/自定义上游格式。
 * 核心目的：把非官方或自定义上游格式映射到 Praxis 可处理的模型适配形态。
 * 能力要求1：需要把自定义 endpoint 的输入、输出、错误、能力描述转换成抽象层可理解的信息。
 * 能力要求2：不把自定义格式提升为 Praxis 核心语义，只负责让它可接入、可调用、可治理。
 * 边界：只处理上游实际调用面，不在这里定义 agentCore 使用 AI 的统一方式。
 * 对接：需要被 runtime.modelAdapter 拉起，并和 provider/carrier、PromptPack lowering、能力抽象链路接通。
 * 实现提示：先补稳定类型契约、最小可测行为和清晰错误边界，再接入真实执行逻辑。
 */

export type CustomFormatMappingBoundary = "input" | "contract" | "governance" | "provider-response";

export type CustomFormatMappingGate = {
  accepted: boolean;
  reason?: string;
};

export type CustomFormatMappingTrace = {
  correlationId?: string;
  callerId?: string;
  source?: string;
};

export type CustomFormatCapabilityMappingInput = {
  capabilityId?: string;
  inputChannels?: readonly string[];
  outputChannels?: readonly string[];
  supportsStreaming?: boolean;
  supportsTools?: boolean;
  supportsFiles?: boolean;
};

export type CustomFormatEndpointMappingRequest = {
  providerId?: string;
  endpointId?: string;
  requestBody?: Readonly<Record<string, unknown>>;
  responseBody?: Readonly<Record<string, unknown>>;
  responseStatus?: number;
  upstreamError?: unknown;
  capability?: CustomFormatCapabilityMappingInput;
  contract?: CustomFormatMappingGate;
  governance?: CustomFormatMappingGate;
  trace?: CustomFormatMappingTrace;
  metadata?: Readonly<Record<string, unknown>>;
};

export type CustomFormatMappedBodyEnvelope = {
  retained: false;
  kind: "record";
  keyHints: readonly string[];
};

export type CustomFormatMappedErrorCategory =
  | "auth"
  | "rate-limit"
  | "timeout"
  | "endpoint-unavailable"
  | "format-drift"
  | "provider-error"
  | "unknown";

export type CustomFormatMappedUpstreamError = {
  category: CustomFormatMappedErrorCategory;
  message: string;
  status?: number;
  keyHints: readonly string[];
  rawProviderFieldsExposed: false;
};

export type CustomFormatMappedCapability = {
  capabilityId: string;
  inputChannels: readonly string[];
  outputChannels: readonly string[];
  supportsStreaming: boolean;
  supportsTools: boolean;
  supportsFiles: boolean;
};

export type CustomFormatEndpointMapping = {
  providerId: string;
  endpointId: string;
  requestEnvelope?: CustomFormatMappedBodyEnvelope;
  responseEnvelope?: CustomFormatMappedBodyEnvelope & {
    status?: number;
  };
  errorEnvelope?: CustomFormatMappedUpstreamError;
  capability?: CustomFormatMappedCapability;
  metadata: Readonly<Record<string, unknown>>;
  trace: CustomFormatMappingTrace;
  abstractionHandoff: {
    target: "agent_modelAdapter.abstractionLayer";
    rawProviderFieldsExposed: false;
    customFormatPromotedToPraxisStandard: false;
  };
  audit: {
    mappedBy: "customFormat.customMapper";
    dryRun: true;
    unsafeSideEffects: false;
  };
};

export type CustomFormatMappingErrorCode =
  | "MISSING_PROVIDER_ID"
  | "MISSING_ENDPOINT_ID"
  | "MISSING_MAPPING_MATERIAL"
  | "INVALID_REQUEST_BODY"
  | "RESPONSE_FORMAT_DRIFT"
  | "INVALID_CAPABILITY"
  | "CONTRACT_REJECTED"
  | "GOVERNANCE_REJECTED";

export type CustomFormatMappingError = {
  code: CustomFormatMappingErrorCode;
  message: string;
  boundary: CustomFormatMappingBoundary;
  safeForRuntimeInspection: true;
  rawProviderFieldsExposed: false;
};

export type CustomFormatMappingResult =
  | {
      ok: true;
      mapping: CustomFormatEndpointMapping;
      events: readonly string[];
    }
  | {
      ok: false;
      error: CustomFormatMappingError;
      events: readonly string[];
    };

export const customFormatMapperDescriptor = {
  layer: "agent_modelAdapter.actualInvocationLayer.customFormat",
  capability: "customFormat.customMapper",
  purpose: "map custom provider request, response, error, and capability material into inspection-safe envelopes",
  dryRun: true,
  unsafeSideEffects: false,
  handoff: "agent_modelAdapter.abstractionLayer",
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

function envelopeFor(body: Readonly<Record<string, unknown>>): CustomFormatMappedBodyEnvelope {
  return {
    retained: false,
    kind: "record",
    keyHints: Object.keys(body).sort(),
  };
}

function failure(
  code: CustomFormatMappingErrorCode,
  message: string,
  boundary: CustomFormatMappingBoundary,
): CustomFormatMappingResult {
  return {
    ok: false,
    error: { code, message, boundary, safeForRuntimeInspection: true, rawProviderFieldsExposed: false },
    events: ["customFormat.mapping.rejected"],
  };
}

function normalizeStatus(status: number | undefined): number | undefined {
  return status === undefined || Number.isSafeInteger(status) ? status : undefined;
}

function errorMessage(error: unknown): string {
  if (error instanceof Error && cleanText(error.message) !== undefined) {
    return cleanText(error.message) as string;
  }

  if (typeof error === "string" && cleanText(error) !== undefined) {
    return cleanText(error) as string;
  }

  if (isRecord(error) && typeof error.message === "string" && cleanText(error.message) !== undefined) {
    return cleanText(error.message) as string;
  }

  return "custom provider returned an upstream error";
}

function errorStatus(error: unknown): number | undefined {
  if (!isRecord(error)) {
    return undefined;
  }

  const status = error.status ?? error.statusCode ?? error.code;
  return typeof status === "number" && Number.isSafeInteger(status) ? status : undefined;
}

function classifyError(error: unknown): CustomFormatMappedErrorCategory {
  const status = errorStatus(error);
  const message = errorMessage(error).toLowerCase();

  if (status === 401 || status === 403 || message.includes("auth") || message.includes("permission")) {
    return "auth";
  }

  if (status === 429 || message.includes("rate limit")) {
    return "rate-limit";
  }

  if (status === 408 || message.includes("timeout") || message.includes("timed out")) {
    return "timeout";
  }

  if (status === 404 || status === 503 || message.includes("unavailable")) {
    return "endpoint-unavailable";
  }

  if (message.includes("schema") || message.includes("format")) {
    return "format-drift";
  }

  return status === undefined ? "unknown" : "provider-error";
}

function mapUpstreamError(error: unknown): CustomFormatMappedUpstreamError {
  return {
    category: classifyError(error),
    message: errorMessage(error),
    status: errorStatus(error),
    keyHints: isRecord(error) ? Object.keys(error).sort() : [],
    rawProviderFieldsExposed: false,
  };
}

function mapCapability(capability: CustomFormatCapabilityMappingInput): CustomFormatMappedCapability | undefined {
  const capabilityId = cleanText(capability.capabilityId);
  const inputChannels = cleanList(capability.inputChannels);
  const outputChannels = cleanList(capability.outputChannels);

  if (capabilityId === undefined || (inputChannels.length === 0 && outputChannels.length === 0)) {
    return undefined;
  }

  return {
    capabilityId,
    inputChannels,
    outputChannels,
    supportsStreaming: capability.supportsStreaming === true,
    supportsTools: capability.supportsTools === true,
    supportsFiles: capability.supportsFiles === true,
  };
}

export function mapCustomFormatEndpoint(request?: CustomFormatEndpointMappingRequest): CustomFormatMappingResult {
  const providerId = cleanText(request?.providerId);
  const endpointId = cleanText(request?.endpointId);

  if (request === undefined || providerId === undefined) {
    return failure("MISSING_PROVIDER_ID", "customFormat mapper requires providerId", "input");
  }

  if (endpointId === undefined) {
    return failure("MISSING_ENDPOINT_ID", "customFormat mapper requires endpointId", "input");
  }

  if (request.contract?.accepted === false) {
    return failure(
      "CONTRACT_REJECTED",
      request.contract.reason ?? "runtime contract surface rejected customFormat mapping",
      "contract",
    );
  }

  if (request.governance?.accepted === false) {
    return failure(
      "GOVERNANCE_REJECTED",
      request.governance.reason ?? "runtime governance rejected customFormat mapping",
      "governance",
    );
  }

  if (
    request.requestBody === undefined &&
    request.responseBody === undefined &&
    request.upstreamError === undefined &&
    request.capability === undefined
  ) {
    return failure("MISSING_MAPPING_MATERIAL", "customFormat mapper requires request, response, error, or capability material", "input");
  }

  if (request.requestBody !== undefined && !isRecord(request.requestBody)) {
    return failure("INVALID_REQUEST_BODY", "customFormat requestBody must be a plain record", "input");
  }

  if (request.responseBody !== undefined && !isRecord(request.responseBody)) {
    return failure(
      "RESPONSE_FORMAT_DRIFT",
      "customFormat responseBody must be a plain record to be safely mapped",
      "provider-response",
    );
  }

  const capability = request.capability === undefined ? undefined : mapCapability(request.capability);
  if (request.capability !== undefined && capability === undefined) {
    return failure(
      "INVALID_CAPABILITY",
      "customFormat capability mapping requires capabilityId and at least one channel",
      "input",
    );
  }

  return {
    ok: true,
    mapping: {
      providerId,
      endpointId,
      requestEnvelope: request.requestBody === undefined ? undefined : envelopeFor(request.requestBody),
      responseEnvelope:
        request.responseBody === undefined
          ? undefined
          : { ...envelopeFor(request.responseBody), status: normalizeStatus(request.responseStatus) },
      errorEnvelope: request.upstreamError === undefined ? undefined : mapUpstreamError(request.upstreamError),
      capability,
      metadata: request.metadata ?? {},
      trace: {
        correlationId: cleanText(request.trace?.correlationId),
        callerId: cleanText(request.trace?.callerId),
        source: cleanText(request.trace?.source),
      },
      abstractionHandoff: {
        target: "agent_modelAdapter.abstractionLayer",
        rawProviderFieldsExposed: false,
        customFormatPromotedToPraxisStandard: false,
      },
      audit: {
        mappedBy: "customFormat.customMapper",
        dryRun: true,
        unsafeSideEffects: false,
      },
    },
    events: ["customFormat.mapping.mapped"],
  };
}
