/*
 * 文件定位：Agent 模型适配层 / 真实上游调用层 / OpenAI 官方调用面。
 * 核心目的：承接 OpenAI 上游的 v1 audio transcriptions 真实调用面。
 * 能力要求1：需要把对应 endpoint 的请求参数、响应形态、错误形态和能力信号整理成可适配对象。
 * 能力要求2：鉴权/API 登录后续会接入，但这里要为“上游能力变得实际可用”预留位置。
 * 能力要求3：不把该 provider 的字段形状提升为 Praxis 统一语义，只作为 actualInvocationLayer 的现实入口。
 * 边界：只处理上游实际调用面，不在这里定义 agentCore 使用 AI 的统一方式。
 * 对接：需要被 runtime.modelAdapter 拉起，并和 provider/carrier、PromptPack lowering、能力抽象链路接通。
 * 实现提示：先补稳定类型契约、最小可测行为和清晰错误边界，再接入真实执行逻辑。
 */

import type { AuthEnvelope } from "../../authProfileLayer/authEnvelope.js";
import { unwrapProviderCallerBody } from "../../providerAccessLayer/providerCaller.js";

export const OPENAI_V1_AUDIO_TRANSCRIPTIONS_ENDPOINT = "/v1/audio/transcriptions" as const;
export const DEFAULT_OPENAI_V1_AUDIO_TRANSCRIPTIONS_BASE_URL = "https://api.openai.com" as const;

export type OpenAIAudioTranscriptionBoundary =
  | "input"
  | "provider"
  | "contract"
  | "governance"
  | "auth"
  | "scope"
  | "response";

export type OpenAIAudioTranscriptionGate = {
  accepted: boolean;
  reason?: string;
};

export type OpenAIAudioTranscriptionFile = {
  id?: string;
  name?: string;
  mimeType?: string;
  byteLength?: number;
  sourceRef?: string;
};

export type OpenAIAudioTranscriptionProviderError = {
  status?: number;
  code?: string;
  message?: string;
  timedOut?: boolean;
  rateLimited?: boolean;
  authFailed?: boolean;
  endpointAvailable?: boolean;
  responseBody?: unknown;
};

export type OpenAIAudioTranscriptionRequest = {
  requestId?: string;
  model?: string;
  file?: OpenAIAudioTranscriptionFile;
  body?: Readonly<Record<string, unknown>>;
  baseUrl?: string;
  headers?: Readonly<Record<string, string | undefined>>;
  auth?: AuthEnvelope;
  apiKeyRef?: string;
  organizationId?: string;
  projectId?: string;
  timeoutMs?: number;
  requestedScopes?: readonly string[];
  allowedScopes?: readonly string[];
  dryRun?: boolean;
  trace?: Readonly<Record<string, string | undefined>>;
  providerResponse?: unknown;
  providerError?: OpenAIAudioTranscriptionProviderError;
  expectResponseObject?: boolean;
  caller?: (envelope: OpenAIAudioTranscriptionEnvelope) => unknown | Promise<unknown>;
  contract?: OpenAIAudioTranscriptionGate;
  governance?: OpenAIAudioTranscriptionGate;
};

export type OpenAIAudioTranscriptionErrorCode =
  | "MISSING_MODEL"
  | "MISSING_AUDIO_FILE"
  | "INVALID_REQUEST_BODY"
  | "INVALID_TIMEOUT"
  | "CONTRACT_REJECTED"
  | "GOVERNANCE_REJECTED"
  | "SCOPE_DENIED"
  | "AUTH_REJECTED"
  | "CALLER_REQUIRED"
  | "REAL_PROVIDER_CALL_NOT_ALLOWED"
  | "PROVIDER_AUTH_FAILED"
  | "PROVIDER_RATE_LIMITED"
  | "PROVIDER_TIMEOUT"
  | "PROVIDER_ENDPOINT_UNAVAILABLE"
  | "PROVIDER_RESPONSE_DRIFT"
  | "PROVIDER_REJECTED";

export type OpenAIAudioTranscriptionError = {
  code: OpenAIAudioTranscriptionErrorCode;
  message: string;
  boundary: OpenAIAudioTranscriptionBoundary;
  safeForRuntimeInspection: true;
  providerRawDetailExposed: false;
};

export type OpenAIAudioTranscriptionEnvelope = {
  provider: "openai";
  endpoint: typeof OPENAI_V1_AUDIO_TRANSCRIPTIONS_ENDPOINT;
  method: "POST";
  url: string;
  requestId: string;
  requestShape: "multipart-form-data";
  model: string;
  file: OpenAIAudioTranscriptionFile;
  headers: Readonly<Record<string, string>>;
  body: Readonly<Record<string, unknown>>;
  auth: {
    apiKeyRef?: string;
    organizationId?: string;
    projectId?: string;
    materialPresent: boolean;
    envelope?: AuthEnvelope;
  };
  runtime: {
    timeoutMs?: number;
    requestedScopes: readonly string[];
    dryRun: boolean;
    providerCallPlanned: boolean;
    unsafeSideEffects: false;
  };
  trace: Readonly<Record<string, string | undefined>>;
};

export type OpenAIAudioTranscriptionResponseEnvelope = {
  provider: "openai";
  endpoint: typeof OPENAI_V1_AUDIO_TRANSCRIPTIONS_ENDPOINT;
  raw: unknown;
  received: true;
  providerRawShapePromoted: false;
};

export type OpenAIAudioTranscriptionResult =
  | {
      ok: true;
      request: OpenAIAudioTranscriptionEnvelope;
      response?: OpenAIAudioTranscriptionResponseEnvelope;
      capability: typeof openAIAudioTranscriptionsDescriptor;
      events: readonly string[];
    }
  | {
      ok: false;
      error: OpenAIAudioTranscriptionError;
      events: readonly string[];
    };

export const openAIAudioTranscriptionsDescriptor = {
  provider: "openai",
  layer: "actualInvocationLayer",
  endpoint: "/v1/audio/transcriptions",
  method: "POST",
  modality: "audio",
  operation: "transcription",
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

function cleanHeaders(headers: OpenAIAudioTranscriptionRequest["headers"]): Readonly<Record<string, string>> {
  return Object.fromEntries(
    Object.entries(headers ?? {})
      .filter((entry): entry is [string, string] => typeof entry[1] === "string" && entry[1].trim().length > 0)
      .map(([key, value]) => [key.trim().toLowerCase(), value.trim()]),
  );
}

function authHeaderPlan(auth: AuthEnvelope | undefined): Readonly<Record<string, string>> {
  return Object.fromEntries((auth?.headerPlan ?? []).map((header) => [header.name.trim().toLowerCase(), String(header.value)]));
}

function normalizeBaseUrl(baseUrl: string | undefined): string {
  return typeof baseUrl === "string" && baseUrl.trim().length > 0
    ? baseUrl.trim().replace(/\/+$/u, "")
    : DEFAULT_OPENAI_V1_AUDIO_TRANSCRIPTIONS_BASE_URL;
}

function failure(
  code: OpenAIAudioTranscriptionErrorCode,
  message: string,
  boundary: OpenAIAudioTranscriptionBoundary,
): OpenAIAudioTranscriptionResult {
  return {
    ok: false,
    error: {
      code,
      message,
      boundary,
      safeForRuntimeInspection: true,
      providerRawDetailExposed: false,
    },
    events: ["modelAdapter.openai.audio.transcriptions.rejected"],
  };
}

function classifyProviderError(error: OpenAIAudioTranscriptionProviderError): OpenAIAudioTranscriptionResult {
  if (error.code === "PROVIDER_AUTH_FAILED") {
    return failure("PROVIDER_AUTH_FAILED", "OpenAI audio transcription authentication was rejected", "provider");
  }

  if (error.code === "PROVIDER_RATE_LIMITED") {
    return failure("PROVIDER_RATE_LIMITED", "OpenAI audio transcription was rate limited", "provider");
  }

  if (error.code === "PROVIDER_TIMEOUT") {
    return failure("PROVIDER_TIMEOUT", "OpenAI audio transcription request timed out", "provider");
  }

  if (error.code === "PROVIDER_UNAVAILABLE") {
    return failure("PROVIDER_ENDPOINT_UNAVAILABLE", "OpenAI audio transcription endpoint is unavailable", "provider");
  }

  if (error.code === "RESPONSE_FORMAT_DRIFT") {
    return failure("PROVIDER_RESPONSE_DRIFT", "OpenAI audio transcription response shape drifted from the expected envelope", "provider");
  }

  if (error.timedOut === true || error.code === "timeout") {
    return failure("PROVIDER_TIMEOUT", "OpenAI audio transcription request timed out", "provider");
  }

  if (error.authFailed === true || error.status === 401 || error.status === 403) {
    return failure("PROVIDER_AUTH_FAILED", "OpenAI audio transcription authentication was rejected", "provider");
  }

  if (error.rateLimited === true || error.status === 429) {
    return failure("PROVIDER_RATE_LIMITED", "OpenAI audio transcription was rate limited", "provider");
  }

  if (error.endpointAvailable === false || error.status === 404) {
    return failure("PROVIDER_ENDPOINT_UNAVAILABLE", "OpenAI audio transcription endpoint is unavailable", "provider");
  }

  if (error.code === "response_drift") {
    return failure("PROVIDER_RESPONSE_DRIFT", "OpenAI audio transcription response shape drifted from the expected envelope", "provider");
  }

  return failure("PROVIDER_REJECTED", error.message ?? "OpenAI audio transcription provider rejected the request", "provider");
}

export async function createOpenAIAudioTranscriptionInvocation(
  request: OpenAIAudioTranscriptionRequest = {},
): Promise<OpenAIAudioTranscriptionResult> {
  if (isBlank(request.model)) {
    return failure("MISSING_MODEL", "OpenAI audio transcription invocation requires a model", "input");
  }

  if (request.file === undefined || !isPlainRecord(request.file)) {
    return failure("MISSING_AUDIO_FILE", "OpenAI audio transcription invocation requires an audio file handle", "input");
  }

  if (request.body !== undefined && !isPlainRecord(request.body)) {
    return failure("INVALID_REQUEST_BODY", "OpenAI audio transcription body must be a plain provider request record", "input");
  }

  if (request.timeoutMs !== undefined && (!Number.isFinite(request.timeoutMs) || request.timeoutMs <= 0)) {
    return failure("INVALID_TIMEOUT", "OpenAI audio transcription timeout must be a positive number", "input");
  }

  if (request.contract?.accepted === false) {
    return failure(
      "CONTRACT_REJECTED",
      request.contract.reason ?? "OpenAI audio transcription invocation was rejected by contract surface",
      "contract",
    );
  }

  if (request.governance?.accepted === false) {
    return failure(
      "GOVERNANCE_REJECTED",
      request.governance.reason ?? "OpenAI audio transcription invocation was rejected by runtime governance",
      "governance",
    );
  }

  const liveMode = request.dryRun === false;
  if (liveMode && request.governance?.accepted !== true) {
    return failure(
      "GOVERNANCE_REJECTED",
      "OpenAI audio transcription live invocation requires affirmative runtime governance",
      "governance",
    );
  }

  if (liveMode && request.auth?.present !== true) {
    return failure("AUTH_REJECTED", "OpenAI audio transcription auth envelope is unavailable", "auth");
  }

  const requestedScopes = cleanList(request.requestedScopes);
  const allowedScopes = cleanList(request.allowedScopes);
  const deniedScopes = requestedScopes.filter((scope) => allowedScopes.length > 0 && !allowedScopes.includes(scope));
  if (deniedScopes.length > 0) {
    return failure("SCOPE_DENIED", `OpenAI audio transcription scope ${deniedScopes[0]} is outside governance`, "scope");
  }

  if (request.providerError !== undefined) {
    return classifyProviderError(request.providerError);
  }

  const model = request.model?.trim() ?? "";
  const requestId = request.requestId?.trim() || `openai:audio:transcriptions:${model}`;
  const envelope: OpenAIAudioTranscriptionEnvelope = {
    provider: "openai",
    endpoint: OPENAI_V1_AUDIO_TRANSCRIPTIONS_ENDPOINT,
    method: "POST",
    url: `${normalizeBaseUrl(request.baseUrl)}${OPENAI_V1_AUDIO_TRANSCRIPTIONS_ENDPOINT}`,
    requestId,
    requestShape: "multipart-form-data",
    model,
    file: request.file,
    headers: {
      ...cleanHeaders(request.headers),
      ...authHeaderPlan(request.auth),
    },
    body: request.body ?? {},
    auth: {
      apiKeyRef: request.apiKeyRef?.trim() || undefined,
      organizationId: request.organizationId?.trim() || undefined,
      projectId: request.projectId?.trim() || undefined,
      materialPresent: request.auth?.present === true || !isBlank(request.apiKeyRef),
      envelope: request.auth,
    },
    runtime: {
      timeoutMs: request.timeoutMs,
      requestedScopes,
      dryRun: !liveMode,
      providerCallPlanned: liveMode,
      unsafeSideEffects: false,
    },
    trace: cleanTrace(request.trace),
  };

  if (liveMode) {
    if (request.caller === undefined) {
      return failure(
        "CALLER_REQUIRED",
        "OpenAI audio transcription live invocation requires an injected provider caller",
        "provider",
      );
    }

    try {
      const raw = unwrapProviderCallerBody(await request.caller(envelope));
      if (request.expectResponseObject === true && !isPlainRecord(raw)) {
        return failure(
          "PROVIDER_RESPONSE_DRIFT",
          "OpenAI audio transcription response shape drifted from the expected envelope",
          "response",
        );
      }
      return {
        ok: true,
        request: envelope,
        response: {
          provider: "openai",
          endpoint: OPENAI_V1_AUDIO_TRANSCRIPTIONS_ENDPOINT,
          raw,
          received: true,
          providerRawShapePromoted: false,
        },
        capability: openAIAudioTranscriptionsDescriptor,
        events: ["modelAdapter.openai.audio.transcriptions.called"],
      };
    } catch (error) {
      return classifyProviderError(error as OpenAIAudioTranscriptionProviderError);
    }
  }

  return {
    ok: true,
    request: envelope,
    response:
      request.providerResponse === undefined
        ? undefined
        : {
            provider: "openai",
            endpoint: "/v1/audio/transcriptions",
            raw: request.providerResponse,
            received: true,
            providerRawShapePromoted: false,
          },
    capability: openAIAudioTranscriptionsDescriptor,
    events: ["modelAdapter.openai.audio.transcriptions.enveloped"],
  };
}
