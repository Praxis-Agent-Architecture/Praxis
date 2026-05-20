/*
 * 文件定位：Agent 模型适配层 / 真实上游调用层 / DeepMind/Gemini 官方调用面。
 * 核心目的：承接 DeepMind/Gemini 上游的 v1beta models stream Generate Content 真实调用面。
 * 能力要求1：需要把对应 endpoint 的请求参数、响应形态、错误形态和能力信号整理成可适配对象。
 * 能力要求2：鉴权/API 登录后续会接入，但这里要为“上游能力变得实际可用”预留位置。
 * 能力要求3：不把该 provider 的字段形状提升为 Praxis 统一语义，只作为 actualInvocationLayer 的现实入口。
 * 边界：只处理上游实际调用面，不在这里定义 agentCore 使用 AI 的统一方式。
 * 对接：需要被 runtime.modelAdapter 拉起，并和 provider/carrier、PromptPack lowering、能力抽象链路接通。
 * 实现提示：先补稳定类型契约、最小可测行为和清晰错误边界，再接入真实执行逻辑。
 */

export const DEEPMIND_V1BETA_MODELS_STREAM_GENERATE_CONTENT_ENDPOINT =
  "/v1beta/models/streamGenerateContent" as const;
export const DEFAULT_DEEPMIND_V1BETA_STREAM_GENERATE_CONTENT_BASE_URL =
  "https://generativelanguage.googleapis.com" as const;

export type DeepMindV1BetaModelsStreamGenerateContentBoundary =
  | "input"
  | "contract"
  | "governance"
  | "auth"
  | "scope"
  | "provider"
  | "response";

export type DeepMindV1BetaModelsStreamGenerateContentErrorCode =
  | "MISSING_MODEL"
  | "MISSING_BODY"
  | "MISSING_RUNTIME_ID"
  | "CONTRACT_REJECTED"
  | "GOVERNANCE_REJECTED"
  | "SCOPE_DENIED"
  | "AUTH_REJECTED"
  | "CALLER_REQUIRED"
  | "PROVIDER_AUTH_FAILED"
  | "PROVIDER_RATE_LIMITED"
  | "PROVIDER_TIMEOUT"
  | "PROVIDER_UNAVAILABLE"
  | "RESPONSE_FORMAT_DRIFT"
  | "CALLER_FAILED";

export type DeepMindV1BetaModelsStreamGenerateContentGate = {
  accepted: boolean;
  reason?: string;
};

export type DeepMindV1BetaModelsStreamGenerateContentRuntimeContext = {
  runtimeId?: string;
  invocationId?: string;
  traceId?: string;
  callerId?: string;
};

export type DeepMindV1BetaModelsStreamGenerateContentAuthEnvelope = {
  kind: "api-key" | "oauth" | "none";
  present: boolean;
  redactedToken?: string;
};

export type DeepMindV1BetaModelsStreamGenerateContentRequestEnvelope = {
  provider: "deepmind";
  apiVersion: "v1beta";
  endpoint: typeof DEEPMIND_V1BETA_MODELS_STREAM_GENERATE_CONTENT_ENDPOINT;
  method: "POST";
  url: string;
  model: string;
  headers: Readonly<Record<string, string>>;
  body: unknown;
  runtime: Required<DeepMindV1BetaModelsStreamGenerateContentRuntimeContext>;
  requestedScopes: readonly string[];
  grantedScopes: readonly string[];
  dryRun: boolean;
  providerCallPlanned: boolean;
  unsafeSideEffects: false;
  providerFieldsOpaque: true;
};

export type DeepMindV1BetaModelsStreamGenerateContentProviderStream =
  | AsyncIterable<unknown>
  | Iterable<unknown>
  | readonly unknown[]
  | unknown;

export type DeepMindV1BetaModelsStreamGenerateContentProviderCaller = (
  envelope: DeepMindV1BetaModelsStreamGenerateContentRequestEnvelope,
) => DeepMindV1BetaModelsStreamGenerateContentProviderStream | Promise<DeepMindV1BetaModelsStreamGenerateContentProviderStream>;

export type DeepMindV1BetaModelsStreamGenerateContentInvocationRequest = {
  model?: string;
  body?: unknown;
  baseUrl?: string;
  headers?: Readonly<Record<string, string | undefined>>;
  auth?: DeepMindV1BetaModelsStreamGenerateContentAuthEnvelope;
  runtime?: DeepMindV1BetaModelsStreamGenerateContentRuntimeContext;
  requiredScopes?: readonly string[];
  allowedScopes?: readonly string[];
  contract?: DeepMindV1BetaModelsStreamGenerateContentGate;
  governance?: DeepMindV1BetaModelsStreamGenerateContentGate;
  dryRun?: boolean;
  mockChunks?: readonly unknown[];
  expectAtLeastOneChunk?: boolean;
  caller?: DeepMindV1BetaModelsStreamGenerateContentProviderCaller;
};

export type DeepMindV1BetaModelsStreamGenerateContentResponseEnvelope = {
  provider: "deepmind";
  endpoint: typeof DEEPMIND_V1BETA_MODELS_STREAM_GENERATE_CONTENT_ENDPOINT;
  mode: "dry-run" | "mock" | "caller";
  chunks: readonly unknown[];
  providerFieldsOpaque: true;
};

export type DeepMindV1BetaModelsStreamGenerateContentCapabilitySignal = {
  provider: "deepmind";
  endpoint: typeof DEEPMIND_V1BETA_MODELS_STREAM_GENERATE_CONTENT_ENDPOINT;
  operation: "stream-generate-content";
  rawShape: "stream-chunks" | "mock" | "dry-run";
};

export type DeepMindV1BetaModelsStreamGenerateContentError = {
  code: DeepMindV1BetaModelsStreamGenerateContentErrorCode;
  message: string;
  boundary: DeepMindV1BetaModelsStreamGenerateContentBoundary;
  retryable: boolean;
};

export type DeepMindV1BetaModelsStreamGenerateContentResult =
  | {
      ok: true;
      request: DeepMindV1BetaModelsStreamGenerateContentRequestEnvelope;
      response: DeepMindV1BetaModelsStreamGenerateContentResponseEnvelope;
      capability: DeepMindV1BetaModelsStreamGenerateContentCapabilitySignal;
      events: readonly string[];
    }
  | {
      ok: false;
      error: DeepMindV1BetaModelsStreamGenerateContentError;
      request?: DeepMindV1BetaModelsStreamGenerateContentRequestEnvelope;
      events: readonly string[];
    };

function hasText(value: string | undefined): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isAsyncIterable(value: unknown): value is AsyncIterable<unknown> {
  return isRecord(value) && Symbol.asyncIterator in value;
}

function isIterable(value: unknown): value is Iterable<unknown> {
  return isRecord(value) && Symbol.iterator in value;
}

function cleanScopes(scopes: readonly string[] | undefined): readonly string[] {
  return [...new Set((scopes ?? []).map((scope) => scope.trim()).filter(Boolean))];
}

function cleanHeaders(
  headers: DeepMindV1BetaModelsStreamGenerateContentInvocationRequest["headers"],
): Readonly<Record<string, string>> {
  return Object.fromEntries(
    Object.entries(headers ?? {})
      .filter((entry): entry is [string, string] => typeof entry[1] === "string" && entry[1].trim().length > 0)
      .map(([key, value]) => [key.trim().toLowerCase(), value.trim()]),
  );
}

function normalizeBaseUrl(baseUrl: string | undefined): string {
  return hasText(baseUrl) ? baseUrl.trim().replace(/\/+$/, "") : DEFAULT_DEEPMIND_V1BETA_STREAM_GENERATE_CONTENT_BASE_URL;
}

async function collectChunks(stream: DeepMindV1BetaModelsStreamGenerateContentProviderStream): Promise<readonly unknown[]> {
  if (Array.isArray(stream)) {
    return stream;
  }

  if (isAsyncIterable(stream)) {
    const chunks: unknown[] = [];
    for await (const chunk of stream) {
      chunks.push(chunk);
    }
    return chunks;
  }

  if (isIterable(stream)) {
    return [...stream];
  }

  return stream === undefined ? [] : [stream];
}

function failure(
  code: DeepMindV1BetaModelsStreamGenerateContentErrorCode,
  message: string,
  boundary: DeepMindV1BetaModelsStreamGenerateContentBoundary,
  retryable = false,
  request?: DeepMindV1BetaModelsStreamGenerateContentRequestEnvelope,
): DeepMindV1BetaModelsStreamGenerateContentResult {
  return {
    ok: false,
    error: { code, message, boundary, retryable },
    request,
    events: ["agentCore.modelAdapter.deepmind.v1beta.models.streamGenerateContent.rejected"],
  };
}

function providerStatus(error: unknown): number | undefined {
  if (!isRecord(error)) {
    return undefined;
  }

  const status = error.status ?? error.statusCode;
  return typeof status === "number" ? status : undefined;
}

function providerCode(error: unknown): string {
  if (!isRecord(error)) {
    return "";
  }

  const code = error.code ?? error.name;
  return typeof code === "string" ? code.toLowerCase() : "";
}

export function classifyDeepMindV1BetaModelsStreamGenerateContentProviderError(
  error: unknown,
): DeepMindV1BetaModelsStreamGenerateContentErrorCode {
  const status = providerStatus(error);
  const code = providerCode(error);

  if (status === 401 || status === 403) {
    return "PROVIDER_AUTH_FAILED";
  }

  if (status === 429) {
    return "PROVIDER_RATE_LIMITED";
  }

  if (status === 408 || code.includes("timeout") || code.includes("abort")) {
    return "PROVIDER_TIMEOUT";
  }

  if (status !== undefined && status >= 500) {
    return "PROVIDER_UNAVAILABLE";
  }

  if (code.includes("format") || code.includes("schema") || code.includes("parse")) {
    return "RESPONSE_FORMAT_DRIFT";
  }

  return "CALLER_FAILED";
}

export async function invokeDeepMindV1BetaModelsStreamGenerateContent(
  input: DeepMindV1BetaModelsStreamGenerateContentInvocationRequest = {},
): Promise<DeepMindV1BetaModelsStreamGenerateContentResult> {
  if (!hasText(input.model)) {
    return failure("MISSING_MODEL", "DeepMind v1beta streamGenerateContent requires a model identifier", "input");
  }

  if (input.body === undefined) {
    return failure("MISSING_BODY", "DeepMind v1beta streamGenerateContent requires an opaque provider body", "input");
  }

  const runtime = input.runtime;
  if (runtime === undefined || !hasText(runtime.runtimeId)) {
    return failure("MISSING_RUNTIME_ID", "DeepMind v1beta streamGenerateContent requires runtime.runtimeId", "input");
  }

  if (input.contract?.accepted === false) {
    return failure(
      "CONTRACT_REJECTED",
      input.contract.reason ?? "DeepMind v1beta streamGenerateContent contract rejected the request",
      "contract",
    );
  }

  if (input.governance?.accepted === false) {
    return failure(
      "GOVERNANCE_REJECTED",
      input.governance.reason ?? "DeepMind v1beta streamGenerateContent governance rejected the request",
      "governance",
    );
  }

  if (input.auth?.present === false) {
    return failure("AUTH_REJECTED", "DeepMind v1beta streamGenerateContent auth envelope is unavailable", "auth");
  }

  const requestedScopes = cleanScopes(input.requiredScopes);
  const allowedScopes = cleanScopes(input.allowedScopes);
  const deniedScopes =
    allowedScopes.length === 0 ? [] : requestedScopes.filter((scope) => !allowedScopes.includes(scope));

  if (deniedScopes.length > 0) {
    return failure(
      "SCOPE_DENIED",
      `DeepMind v1beta streamGenerateContent requested scopes outside the allowed boundary: ${deniedScopes.join(", ")}`,
      "scope",
    );
  }

  const model = input.model.trim();
  const request: DeepMindV1BetaModelsStreamGenerateContentRequestEnvelope = {
    provider: "deepmind",
    apiVersion: "v1beta",
    endpoint: DEEPMIND_V1BETA_MODELS_STREAM_GENERATE_CONTENT_ENDPOINT,
    method: "POST",
    url: `${normalizeBaseUrl(input.baseUrl)}${DEEPMIND_V1BETA_MODELS_STREAM_GENERATE_CONTENT_ENDPOINT}`,
    model,
    headers: cleanHeaders(input.headers),
    body: input.body,
    runtime: {
      runtimeId: runtime.runtimeId.trim(),
      invocationId: runtime.invocationId?.trim() || "",
      traceId: runtime.traceId?.trim() || "",
      callerId: runtime.callerId?.trim() || "",
    },
    requestedScopes,
    grantedScopes: requestedScopes,
    dryRun: input.dryRun !== false,
    providerCallPlanned: input.dryRun === false,
    unsafeSideEffects: false,
    providerFieldsOpaque: true,
  };

  if (request.dryRun) {
    const chunks = input.mockChunks ?? [];
    return {
      ok: true,
      request,
      response: {
        provider: "deepmind",
        endpoint: DEEPMIND_V1BETA_MODELS_STREAM_GENERATE_CONTENT_ENDPOINT,
        mode: input.mockChunks === undefined ? "dry-run" : "mock",
        chunks,
        providerFieldsOpaque: true,
      },
      capability: {
        provider: "deepmind",
        endpoint: DEEPMIND_V1BETA_MODELS_STREAM_GENERATE_CONTENT_ENDPOINT,
        operation: "stream-generate-content",
        rawShape: input.mockChunks === undefined ? "dry-run" : "mock",
      },
      events: ["agentCore.modelAdapter.deepmind.v1beta.models.streamGenerateContent.dryRun"],
    };
  }

  if (input.caller === undefined) {
    return failure(
      "CALLER_REQUIRED",
      "DeepMind v1beta streamGenerateContent live invocation requires an injected provider caller",
      "provider",
      false,
      request,
    );
  }

  try {
    const chunks = await collectChunks(await input.caller(request));
    if (input.expectAtLeastOneChunk === true && chunks.length === 0) {
      return failure(
        "RESPONSE_FORMAT_DRIFT",
        "DeepMind v1beta streamGenerateContent response did not yield provider stream chunks",
        "response",
        false,
        request,
      );
    }

    return {
      ok: true,
      request,
      response: {
        provider: "deepmind",
        endpoint: DEEPMIND_V1BETA_MODELS_STREAM_GENERATE_CONTENT_ENDPOINT,
        mode: "caller",
        chunks,
        providerFieldsOpaque: true,
      },
      capability: {
        provider: "deepmind",
        endpoint: DEEPMIND_V1BETA_MODELS_STREAM_GENERATE_CONTENT_ENDPOINT,
        operation: "stream-generate-content",
        rawShape: "stream-chunks",
      },
      events: ["agentCore.modelAdapter.deepmind.v1beta.models.streamGenerateContent.called"],
    };
  } catch (error) {
    const code = classifyDeepMindV1BetaModelsStreamGenerateContentProviderError(error);
    return failure(
      code,
      `DeepMind v1beta streamGenerateContent provider caller failed with ${code}`,
      code === "RESPONSE_FORMAT_DRIFT" ? "response" : "provider",
      code === "PROVIDER_RATE_LIMITED" || code === "PROVIDER_TIMEOUT" || code === "PROVIDER_UNAVAILABLE",
      request,
    );
  }
}
