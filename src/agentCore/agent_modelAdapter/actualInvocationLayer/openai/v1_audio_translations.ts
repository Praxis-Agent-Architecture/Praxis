/*
 * 文件定位：Agent 模型适配层 / 真实上游调用层 / OpenAI 官方调用面。
 * 核心目的：承接 OpenAI 上游的 v1 audio translations 真实调用面。
 * 能力要求1：需要把对应 endpoint 的请求参数、响应形态、错误形态和能力信号整理成可适配对象。
 * 能力要求2：鉴权/API 登录后续会接入，但这里要为“上游能力变得实际可用”预留位置。
 * 能力要求3：不把该 provider 的字段形状提升为 Praxis 统一语义，只作为 actualInvocationLayer 的现实入口。
 * 边界：只处理上游实际调用面，不在这里定义 agentCore 使用 AI 的统一方式。
 * 对接：需要被 runtime.modelAdapter 拉起，并和 provider/carrier、PromptPack lowering、能力抽象链路接通。
 * 实现提示：先补稳定类型契约、最小可测行为和清晰错误边界，再接入真实执行逻辑。
 */

export type OpenAIAudioTranslationBoundary =
  | "input"
  | "provider"
  | "contract"
  | "governance"
  | "scope";

export type OpenAIAudioTranslationGate = {
  accepted: boolean;
  reason?: string;
};

export type OpenAIAudioTranslationFile = {
  id?: string;
  name?: string;
  mimeType?: string;
  byteLength?: number;
  sourceRef?: string;
};

export type OpenAIAudioTranslationProviderError = {
  status?: number;
  code?: string;
  message?: string;
  timedOut?: boolean;
  rateLimited?: boolean;
  authFailed?: boolean;
  endpointAvailable?: boolean;
};

export type OpenAIAudioTranslationRequest = {
  requestId?: string;
  model?: string;
  file?: OpenAIAudioTranslationFile;
  body?: Readonly<Record<string, unknown>>;
  apiKeyRef?: string;
  organizationId?: string;
  projectId?: string;
  timeoutMs?: number;
  requestedScopes?: readonly string[];
  allowedScopes?: readonly string[];
  dryRun?: boolean;
  trace?: Readonly<Record<string, string | undefined>>;
  providerResponse?: unknown;
  providerError?: OpenAIAudioTranslationProviderError;
  contract?: OpenAIAudioTranslationGate;
  governance?: OpenAIAudioTranslationGate;
};

export type OpenAIAudioTranslationErrorCode =
  | "MISSING_MODEL"
  | "MISSING_AUDIO_FILE"
  | "INVALID_REQUEST_BODY"
  | "INVALID_TIMEOUT"
  | "CONTRACT_REJECTED"
  | "GOVERNANCE_REJECTED"
  | "SCOPE_DENIED"
  | "REAL_PROVIDER_CALL_NOT_ALLOWED"
  | "PROVIDER_AUTH_FAILED"
  | "PROVIDER_RATE_LIMITED"
  | "PROVIDER_TIMEOUT"
  | "PROVIDER_ENDPOINT_UNAVAILABLE"
  | "PROVIDER_RESPONSE_DRIFT"
  | "PROVIDER_REJECTED";

export type OpenAIAudioTranslationError = {
  code: OpenAIAudioTranslationErrorCode;
  message: string;
  boundary: OpenAIAudioTranslationBoundary;
  safeForRuntimeInspection: true;
  providerRawDetailExposed: false;
};

export type OpenAIAudioTranslationEnvelope = {
  provider: "openai";
  endpoint: "/v1/audio/translations";
  method: "POST";
  requestId: string;
  requestShape: "multipart-form-data";
  model: string;
  file: OpenAIAudioTranslationFile;
  body: Readonly<Record<string, unknown>>;
  auth: {
    apiKeyRef?: string;
    organizationId?: string;
    projectId?: string;
    materialPresent: boolean;
  };
  runtime: {
    timeoutMs?: number;
    requestedScopes: readonly string[];
    dryRun: true;
    unsafeSideEffects: false;
  };
  trace: Readonly<Record<string, string | undefined>>;
};

export type OpenAIAudioTranslationResponseEnvelope = {
  provider: "openai";
  endpoint: "/v1/audio/translations";
  raw: unknown;
  received: true;
  providerRawShapePromoted: false;
};

export type OpenAIAudioTranslationResult =
  | {
      ok: true;
      request: OpenAIAudioTranslationEnvelope;
      response?: OpenAIAudioTranslationResponseEnvelope;
      capability: typeof openAIAudioTranslationsDescriptor;
      events: readonly string[];
    }
  | {
      ok: false;
      error: OpenAIAudioTranslationError;
      events: readonly string[];
    };

export const openAIAudioTranslationsDescriptor = {
  provider: "openai",
  layer: "actualInvocationLayer",
  endpoint: "/v1/audio/translations",
  method: "POST",
  modality: "audio",
  operation: "translation",
  requestShape: "multipart-form-data",
  providerRawShapePromoted: false,
  unsafeSideEffects: false,
} as const;

function isBlank(value: string | undefined): boolean {
  return typeof value !== "string" || value.trim().length === 0;
}

function isPlainRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function cleanList(values: readonly string[] | undefined): string[] {
  return [...new Set((values ?? []).map((value) => value.trim()).filter(Boolean))];
}

function cleanTrace(trace: Readonly<Record<string, string | undefined>> | undefined): Readonly<Record<string, string>> {
  const cleaned: Record<string, string> = {};
  for (const [rawKey, rawValue] of Object.entries(trace ?? {})) {
    const key = rawKey.trim();
    const value = rawValue?.trim();
    if (key.length > 0 && value !== undefined && value.length > 0) {
      cleaned[key] = value;
    }
  }
  return cleaned;
}

function failure(
  code: OpenAIAudioTranslationErrorCode,
  message: string,
  boundary: OpenAIAudioTranslationBoundary,
): OpenAIAudioTranslationResult {
  return {
    ok: false,
    error: {
      code,
      message,
      boundary,
      safeForRuntimeInspection: true,
      providerRawDetailExposed: false,
    },
    events: ["modelAdapter.openai.audio.translations.rejected"],
  };
}

function classifyProviderError(error: OpenAIAudioTranslationProviderError): OpenAIAudioTranslationResult {
  if (error.timedOut === true || error.code === "timeout") {
    return failure("PROVIDER_TIMEOUT", "OpenAI audio translation request timed out", "provider");
  }

  if (error.authFailed === true || error.status === 401 || error.status === 403) {
    return failure("PROVIDER_AUTH_FAILED", "OpenAI audio translation authentication was rejected", "provider");
  }

  if (error.rateLimited === true || error.status === 429) {
    return failure("PROVIDER_RATE_LIMITED", "OpenAI audio translation was rate limited", "provider");
  }

  if (error.endpointAvailable === false || error.status === 404) {
    return failure("PROVIDER_ENDPOINT_UNAVAILABLE", "OpenAI audio translation endpoint is unavailable", "provider");
  }

  if (error.code === "response_drift") {
    return failure("PROVIDER_RESPONSE_DRIFT", "OpenAI audio translation response shape drifted from the expected envelope", "provider");
  }

  return failure("PROVIDER_REJECTED", error.message ?? "OpenAI audio translation provider rejected the request", "provider");
}

export function createOpenAIAudioTranslationInvocation(
  request: OpenAIAudioTranslationRequest = {},
): OpenAIAudioTranslationResult {
  if (isBlank(request.model)) {
    return failure("MISSING_MODEL", "OpenAI audio translation invocation requires a model", "input");
  }

  if (request.file === undefined || !isPlainRecord(request.file)) {
    return failure("MISSING_AUDIO_FILE", "OpenAI audio translation invocation requires an audio file handle", "input");
  }

  if (request.body !== undefined && !isPlainRecord(request.body)) {
    return failure("INVALID_REQUEST_BODY", "OpenAI audio translation body must be a plain provider request record", "input");
  }

  if (request.timeoutMs !== undefined && (!Number.isFinite(request.timeoutMs) || request.timeoutMs <= 0)) {
    return failure("INVALID_TIMEOUT", "OpenAI audio translation timeout must be a positive number", "input");
  }

  if (request.dryRun === false) {
    return failure(
      "REAL_PROVIDER_CALL_NOT_ALLOWED",
      "first-round OpenAI audio translation invocation only builds dry-run or mock envelopes",
      "governance",
    );
  }

  if (request.contract?.accepted === false) {
    return failure(
      "CONTRACT_REJECTED",
      request.contract.reason ?? "OpenAI audio translation invocation was rejected by contract surface",
      "contract",
    );
  }

  if (request.governance?.accepted === false) {
    return failure(
      "GOVERNANCE_REJECTED",
      request.governance.reason ?? "OpenAI audio translation invocation was rejected by runtime governance",
      "governance",
    );
  }

  const requestedScopes = cleanList(request.requestedScopes);
  const allowedScopes = cleanList(request.allowedScopes);
  const deniedScopes = requestedScopes.filter((scope) => allowedScopes.length > 0 && !allowedScopes.includes(scope));
  if (deniedScopes.length > 0) {
    return failure("SCOPE_DENIED", `OpenAI audio translation scope ${deniedScopes[0]} is outside governance`, "scope");
  }

  if (request.providerError !== undefined) {
    return classifyProviderError(request.providerError);
  }

  const model = request.model?.trim() ?? "";
  const requestId = request.requestId?.trim() || `openai:audio:translations:${model}`;
  const envelope: OpenAIAudioTranslationEnvelope = {
    provider: "openai",
    endpoint: "/v1/audio/translations",
    method: "POST",
    requestId,
    requestShape: "multipart-form-data",
    model,
    file: request.file,
    body: request.body ?? {},
    auth: {
      apiKeyRef: request.apiKeyRef?.trim() || undefined,
      organizationId: request.organizationId?.trim() || undefined,
      projectId: request.projectId?.trim() || undefined,
      materialPresent: !isBlank(request.apiKeyRef),
    },
    runtime: {
      timeoutMs: request.timeoutMs,
      requestedScopes,
      dryRun: true,
      unsafeSideEffects: false,
    },
    trace: cleanTrace(request.trace),
  };

  return {
    ok: true,
    request: envelope,
    response:
      request.providerResponse === undefined
        ? undefined
        : {
            provider: "openai",
            endpoint: "/v1/audio/translations",
            raw: request.providerResponse,
            received: true,
            providerRawShapePromoted: false,
          },
    capability: openAIAudioTranslationsDescriptor,
    events: ["modelAdapter.openai.audio.translations.enveloped"],
  };
}
