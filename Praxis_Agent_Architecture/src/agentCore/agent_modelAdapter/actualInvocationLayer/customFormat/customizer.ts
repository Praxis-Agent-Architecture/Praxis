/*
 * 文件定位：Agent 模型适配层 / 真实上游调用层 / 非官方/自定义上游格式。
 * 核心目的：承接不兼容官方形式的自定义上游模型调用形态。
 * 能力要求1：凡是不走 OpenAI、Anthropic、DeepMind/Gemini 官方格式的接入，都应进入 customFormat 体系。
 * 能力要求2：需要允许私有网关、第三方模型服务、自定义 endpoint 或特殊协议被标准化接入。
 * 边界：只处理上游实际调用面，不在这里定义 agentCore 使用 AI 的统一方式。
 * 对接：需要被 runtime.modelAdapter 拉起，并和 provider/carrier、PromptPack lowering、能力抽象链路接通。
 * 实现提示：先补稳定类型契约、最小可测行为和清晰错误边界，再接入真实执行逻辑。
 */

import {
  type CustomFormatEndpointMapping,
  type CustomFormatMappingBoundary,
  type CustomFormatMappingGate,
  type CustomFormatMappingTrace,
  mapCustomFormatEndpoint,
} from "./customMapper.js";

export type CustomFormatProtocol = "http" | "websocket" | "sdk" | "custom";

export type CustomFormatMethod = "GET" | "POST" | "PUT" | "PATCH" | "DELETE" | "CUSTOM";

export type CustomFormatAuthEnvelope = {
  required: boolean;
  present: boolean;
  scheme?: string;
};

export type CustomFormatCustomizerRequest = {
  providerId?: string;
  endpointId?: string;
  endpoint?: string;
  protocol?: CustomFormatProtocol;
  method?: CustomFormatMethod;
  headers?: Readonly<Record<string, string>>;
  body?: Readonly<Record<string, unknown>>;
  auth?: CustomFormatAuthEnvelope;
  handlerId?: string;
  officialProviderFamily?: "openai" | "anthropic" | "deepmind" | "custom";
  timeoutMs?: number;
  retryLimit?: number;
  contract?: CustomFormatMappingGate;
  governance?: CustomFormatMappingGate;
  trace?: CustomFormatMappingTrace;
  metadata?: Readonly<Record<string, unknown>>;
};

export type CustomFormatInvocationPlan = {
  providerId: string;
  endpointId: string;
  endpoint: string;
  protocol: CustomFormatProtocol;
  method: CustomFormatMethod;
  headerHints: readonly string[];
  mappedRequest?: CustomFormatEndpointMapping["requestEnvelope"];
  auth: CustomFormatAuthEnvelope;
  timeoutMs: number;
  retryLimit: number;
  handlerId?: string;
  metadata: Readonly<Record<string, unknown>>;
  trace: CustomFormatMappingTrace;
  providerCarrierHandoff: {
    target: "providerCarrierRegistry";
    mockable: true;
    networkCallStarted: false;
  };
  abstractionHandoff: {
    target: "agent_modelAdapter.abstractionLayer";
    rawProviderFieldsExposed: false;
    customFormatPromotedToPraxisStandard: false;
  };
  audit: {
    customizedBy: "customFormat.customizer";
    dryRun: true;
    unsafeSideEffects: false;
  };
};

export type CustomFormatCustomizerErrorCode =
  | "MISSING_PROVIDER_ID"
  | "MISSING_ENDPOINT_ID"
  | "MISSING_ENDPOINT"
  | "OFFICIAL_PROVIDER_NOT_CUSTOM"
  | "CUSTOM_PROTOCOL_REQUIRES_HANDLER"
  | "INVALID_TIMEOUT"
  | "INVALID_RETRY_LIMIT"
  | "MAPPING_REJECTED"
  | "CONTRACT_REJECTED"
  | "GOVERNANCE_REJECTED";

export type CustomFormatCustomizerError = {
  code: CustomFormatCustomizerErrorCode;
  message: string;
  boundary: CustomFormatMappingBoundary | "provider-config";
  safeForRuntimeInspection: true;
  rawProviderFieldsExposed: false;
};

export type CustomFormatCustomizerResult =
  | {
      ok: true;
      plan: CustomFormatInvocationPlan;
      events: readonly string[];
    }
  | {
      ok: false;
      error: CustomFormatCustomizerError;
      events: readonly string[];
    };

export const customFormatCustomizerDescriptor = {
  layer: "agent_modelAdapter.actualInvocationLayer.customFormat",
  capability: "customFormat.customizer",
  purpose: "prepare a dry-run invocation plan for non-official custom provider endpoints",
  dryRun: true,
  unsafeSideEffects: false,
  mockable: true,
} as const;

function cleanText(value: string | undefined): string | undefined {
  const cleaned = value?.trim();
  return cleaned === undefined || cleaned.length === 0 ? undefined : cleaned;
}

function cleanHeaderHints(headers: Readonly<Record<string, string>> | undefined): readonly string[] {
  return Object.keys(headers ?? {}).map((header) => header.toLowerCase()).sort();
}

function failure(
  code: CustomFormatCustomizerErrorCode,
  message: string,
  boundary: CustomFormatCustomizerError["boundary"],
): CustomFormatCustomizerResult {
  return {
    ok: false,
    error: { code, message, boundary, safeForRuntimeInspection: true, rawProviderFieldsExposed: false },
    events: ["customFormat.customizer.rejected"],
  };
}

function timeoutMs(value: number | undefined): number | undefined {
  if (value === undefined) {
    return undefined;
  }

  return Number.isSafeInteger(value) && value > 0 ? value : undefined;
}

function retryLimit(value: number | undefined): number | undefined {
  if (value === undefined) {
    return undefined;
  }

  return Number.isSafeInteger(value) && value >= 0 ? value : undefined;
}

export function prepareCustomFormatInvocation(
  request?: CustomFormatCustomizerRequest,
): CustomFormatCustomizerResult {
  const providerId = cleanText(request?.providerId);
  const endpointId = cleanText(request?.endpointId);
  const endpoint = cleanText(request?.endpoint);
  const protocol = request?.protocol ?? "http";
  const method = request?.method ?? "POST";

  if (request === undefined || providerId === undefined) {
    return failure("MISSING_PROVIDER_ID", "customFormat customizer requires providerId", "input");
  }

  if (endpointId === undefined) {
    return failure("MISSING_ENDPOINT_ID", "customFormat customizer requires endpointId", "input");
  }

  if (endpoint === undefined) {
    return failure("MISSING_ENDPOINT", "customFormat customizer requires an endpoint or protocol target", "input");
  }

  if (
    request.officialProviderFamily === "openai" ||
    request.officialProviderFamily === "anthropic" ||
    request.officialProviderFamily === "deepmind"
  ) {
    return failure(
      "OFFICIAL_PROVIDER_NOT_CUSTOM",
      "official OpenAI, Anthropic, and DeepMind/Gemini formats should use their dedicated actualInvocationLayer",
      "provider-config",
    );
  }

  if (protocol === "custom" && cleanText(request.handlerId) === undefined) {
    return failure(
      "CUSTOM_PROTOCOL_REQUIRES_HANDLER",
      "custom protocol invocation requires an injected handlerId for later providerCarrier routing",
      "provider-config",
    );
  }

  if (request.timeoutMs !== undefined && timeoutMs(request.timeoutMs) === undefined) {
    return failure("INVALID_TIMEOUT", "customFormat timeoutMs must be a positive safe integer", "provider-config");
  }

  if (request.retryLimit !== undefined && retryLimit(request.retryLimit) === undefined) {
    return failure("INVALID_RETRY_LIMIT", "customFormat retryLimit must be a non-negative safe integer", "provider-config");
  }

  if (request.contract?.accepted === false) {
    return failure(
      "CONTRACT_REJECTED",
      request.contract.reason ?? "runtime contract surface rejected customFormat invocation",
      "contract",
    );
  }

  if (request.governance?.accepted === false) {
    return failure(
      "GOVERNANCE_REJECTED",
      request.governance.reason ?? "runtime governance rejected customFormat invocation",
      "governance",
    );
  }

  const mapping =
    request.body === undefined
      ? undefined
      : mapCustomFormatEndpoint({
          providerId,
          endpointId,
          requestBody: request.body,
          contract: request.contract,
          governance: request.governance,
          trace: request.trace,
        });

  if (mapping !== undefined && !mapping.ok) {
    return failure("MAPPING_REJECTED", mapping.error.message, mapping.error.boundary);
  }

  return {
    ok: true,
    plan: {
      providerId,
      endpointId,
      endpoint,
      protocol,
      method,
      headerHints: cleanHeaderHints(request.headers),
      mappedRequest: mapping?.mapping.requestEnvelope,
      auth: request.auth ?? { required: false, present: false },
      timeoutMs: timeoutMs(request.timeoutMs) ?? 30_000,
      retryLimit: retryLimit(request.retryLimit) ?? 0,
      handlerId: cleanText(request.handlerId),
      metadata: request.metadata ?? {},
      trace: {
        correlationId: cleanText(request.trace?.correlationId),
        callerId: cleanText(request.trace?.callerId),
        source: cleanText(request.trace?.source),
      },
      providerCarrierHandoff: {
        target: "providerCarrierRegistry",
        mockable: true,
        networkCallStarted: false,
      },
      abstractionHandoff: {
        target: "agent_modelAdapter.abstractionLayer",
        rawProviderFieldsExposed: false,
        customFormatPromotedToPraxisStandard: false,
      },
      audit: {
        customizedBy: "customFormat.customizer",
        dryRun: true,
        unsafeSideEffects: false,
      },
    },
    events: ["customFormat.customizer.planned"],
  };
}
