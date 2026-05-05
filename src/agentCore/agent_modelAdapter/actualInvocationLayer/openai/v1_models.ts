/*
 * 文件定位：Agent 模型适配层 / 真实上游调用层 / OpenAI 官方调用面。
 * 核心目的：承接 OpenAI 上游的 v1 models 真实调用面。
 * 能力要求1：需要把对应 endpoint 的请求参数、响应形态、错误形态和能力信号整理成可适配对象。
 * 能力要求2：鉴权/API 登录后续会接入，但这里要为“上游能力变得实际可用”预留位置。
 * 能力要求3：不把该 provider 的字段形状提升为 Praxis 统一语义，只作为 actualInvocationLayer 的现实入口。
 * 边界：只处理上游实际调用面，不在这里定义 agentCore 使用 AI 的统一方式。
 * 对接：需要被 runtime.modelAdapter 拉起，并和 provider/carrier、PromptPack lowering、能力抽象链路接通。
 * 实现提示：先补稳定类型契约、最小可测行为和清晰错误边界，再接入真实执行逻辑。
 */

export const OPENAI_V1_MODELS_ENDPOINT = "/v1/models" as const;
export const DEFAULT_OPENAI_V1_MODELS_BASE_URL = "https://api.openai.com" as const;

export type OpenAIV1ModelsOperation = "list" | "retrieve" | "delete";
export type OpenAIV1ModelsMethod = "GET" | "DELETE";

export type OpenAIV1ModelsBoundary =
  | "input"
  | "contract"
  | "governance"
  | "auth"
  | "scope"
  | "provider"
  | "response";

export type OpenAIV1ModelsErrorCode =
  | "MISSING_OPERATION"
  | "MISSING_MODEL_ID"
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

export type OpenAIV1ModelsGate = {
  accepted: boolean;
  reason?: string;
};

export type OpenAIV1ModelsRuntimeContext = {
  runtimeId?: string;
  invocationId?: string;
  traceId?: string;
  callerId?: string;
};

export type OpenAIV1ModelsAuthEnvelope = {
  kind: "bearer" | "api-key" | "none";
  present: boolean;
  redactedToken?: string;
};

export type OpenAIV1ModelsRequestEnvelope = {
  provider: "openai";
  apiVersion: "v1";
  endpoint: typeof OPENAI_V1_MODELS_ENDPOINT;
  operation: OpenAIV1ModelsOperation;
  method: OpenAIV1ModelsMethod;
  url: string;
  pathSuffix: string;
  query: Readonly<Record<string, string>>;
  headers: Readonly<Record<string, string>>;
  runtime: Required<OpenAIV1ModelsRuntimeContext>;
  requestedScopes: readonly string[];
  grantedScopes: readonly string[];
  dryRun: boolean;
  providerCallPlanned: boolean;
  unsafeSideEffects: false;
  providerFieldsOpaque: true;
};

export type OpenAIV1ModelsProviderCaller = (envelope: OpenAIV1ModelsRequestEnvelope) => unknown | Promise<unknown>;

export type OpenAIV1ModelsInvocationRequest = {
  operation?: OpenAIV1ModelsOperation;
  modelId?: string;
  query?: Readonly<Record<string, string | number | boolean | undefined>>;
  headers?: Readonly<Record<string, string | undefined>>;
  baseUrl?: string;
  auth?: OpenAIV1ModelsAuthEnvelope;
  runtime?: OpenAIV1ModelsRuntimeContext;
  requiredScopes?: readonly string[];
  allowedScopes?: readonly string[];
  contract?: OpenAIV1ModelsGate;
  governance?: OpenAIV1ModelsGate;
  dryRun?: boolean;
  mockResponse?: unknown;
  expectResponseObject?: boolean;
  caller?: OpenAIV1ModelsProviderCaller;
};

export type OpenAIV1ModelsResponseEnvelope = {
  provider: "openai";
  endpoint: typeof OPENAI_V1_MODELS_ENDPOINT;
  mode: "dry-run" | "mock" | "caller";
  raw: unknown;
  providerFieldsOpaque: true;
};

export type OpenAIV1ModelsCapabilitySignal = {
  provider: "openai";
  endpoint: typeof OPENAI_V1_MODELS_ENDPOINT;
  operation: OpenAIV1ModelsOperation;
  rawShape: "model-list" | "model-object" | "model-deletion" | "mock" | "dry-run";
};

export type OpenAIV1ModelsError = {
  code: OpenAIV1ModelsErrorCode;
  message: string;
  boundary: OpenAIV1ModelsBoundary;
  retryable: boolean;
};

export type OpenAIV1ModelsResult =
  | {
      ok: true;
      request: OpenAIV1ModelsRequestEnvelope;
      response: OpenAIV1ModelsResponseEnvelope;
      capability: OpenAIV1ModelsCapabilitySignal;
      events: readonly string[];
    }
  | {
      ok: false;
      error: OpenAIV1ModelsError;
      request?: OpenAIV1ModelsRequestEnvelope;
      events: readonly string[];
    };

function hasText(value: string | undefined): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function cleanScopes(scopes: readonly string[] | undefined): readonly string[] {
  return [...new Set((scopes ?? []).map((scope) => scope.trim()).filter(Boolean))];
}

function cleanQuery(query: OpenAIV1ModelsInvocationRequest["query"]): Readonly<Record<string, string>> {
  return Object.fromEntries(
    Object.entries(query ?? {})
      .filter((entry): entry is [string, string | number | boolean] => entry[1] !== undefined)
      .map(([key, value]) => [key.trim(), String(value)]),
  );
}

function cleanHeaders(headers: OpenAIV1ModelsInvocationRequest["headers"]): Readonly<Record<string, string>> {
  return Object.fromEntries(
    Object.entries(headers ?? {})
      .filter((entry): entry is [string, string] => typeof entry[1] === "string" && entry[1].trim().length > 0)
      .map(([key, value]) => [key.trim().toLowerCase(), value.trim()]),
  );
}

function normalizeBaseUrl(baseUrl: string | undefined): string {
  return hasText(baseUrl) ? baseUrl.trim().replace(/\/+$/, "") : DEFAULT_OPENAI_V1_MODELS_BASE_URL;
}

function cleanModelId(modelId: string | undefined): string {
  return modelId?.trim().replace(/^\/+/, "").replace(/\/+$/, "") ?? "";
}

function buildUrl(baseUrl: string | undefined, modelId: string | undefined): string {
  const suffix = cleanModelId(modelId);
  return suffix ? `${normalizeBaseUrl(baseUrl)}${OPENAI_V1_MODELS_ENDPOINT}/${suffix}` : `${normalizeBaseUrl(baseUrl)}${OPENAI_V1_MODELS_ENDPOINT}`;
}

function failure(
  code: OpenAIV1ModelsErrorCode,
  message: string,
  boundary: OpenAIV1ModelsBoundary,
  retryable = false,
  request?: OpenAIV1ModelsRequestEnvelope,
): OpenAIV1ModelsResult {
  return {
    ok: false,
    error: { code, message, boundary, retryable },
    request,
    events: ["agentCore.modelAdapter.openai.v1.models.rejected"],
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

function inferRawShape(operation: OpenAIV1ModelsOperation, raw: unknown): OpenAIV1ModelsCapabilitySignal["rawShape"] {
  if (operation === "list" || (isRecord(raw) && Array.isArray(raw.data))) {
    return "model-list";
  }

  if (operation === "delete") {
    return "model-deletion";
  }

  return "model-object";
}

export function classifyOpenAIV1ModelsProviderError(error: unknown): OpenAIV1ModelsErrorCode {
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

export async function invokeOpenAIV1Models(
  input: OpenAIV1ModelsInvocationRequest = {},
): Promise<OpenAIV1ModelsResult> {
  if (input.operation === undefined) {
    return failure("MISSING_OPERATION", "OpenAI v1 models invocation requires an explicit operation", "input");
  }

  if ((input.operation === "retrieve" || input.operation === "delete") && !hasText(input.modelId)) {
    return failure("MISSING_MODEL_ID", "OpenAI v1 models retrieve/delete invocation requires modelId", "input");
  }

  const runtime = input.runtime;
  if (runtime === undefined || !hasText(runtime.runtimeId)) {
    return failure("MISSING_RUNTIME_ID", "OpenAI v1 models invocation requires runtime.runtimeId", "input");
  }

  if (input.contract?.accepted === false) {
    return failure(
      "CONTRACT_REJECTED",
      input.contract.reason ?? "OpenAI v1 models contract rejected the request",
      "contract",
    );
  }

  if (input.governance?.accepted === false) {
    return failure(
      "GOVERNANCE_REJECTED",
      input.governance.reason ?? "OpenAI v1 models governance rejected the request",
      "governance",
    );
  }

  if (input.auth?.present === false) {
    return failure("AUTH_REJECTED", "OpenAI v1 models auth envelope is unavailable", "auth");
  }

  const requestedScopes = cleanScopes(input.requiredScopes);
  const allowedScopes = cleanScopes(input.allowedScopes);
  const deniedScopes =
    allowedScopes.length === 0 ? [] : requestedScopes.filter((scope) => !allowedScopes.includes(scope));

  if (deniedScopes.length > 0) {
    return failure(
      "SCOPE_DENIED",
      `OpenAI v1 models requested scopes outside the allowed boundary: ${deniedScopes.join(", ")}`,
      "scope",
    );
  }

  const pathSuffix = cleanModelId(input.modelId);
  const request: OpenAIV1ModelsRequestEnvelope = {
    provider: "openai",
    apiVersion: "v1",
    endpoint: OPENAI_V1_MODELS_ENDPOINT,
    operation: input.operation,
    method: input.operation === "delete" ? "DELETE" : "GET",
    url: buildUrl(input.baseUrl, input.modelId),
    pathSuffix,
    query: cleanQuery(input.query),
    headers: cleanHeaders(input.headers),
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
    return {
      ok: true,
      request,
      response: {
        provider: "openai",
        endpoint: OPENAI_V1_MODELS_ENDPOINT,
        mode: input.mockResponse === undefined ? "dry-run" : "mock",
        raw: input.mockResponse ?? null,
        providerFieldsOpaque: true,
      },
      capability: {
        provider: "openai",
        endpoint: OPENAI_V1_MODELS_ENDPOINT,
        operation: input.operation,
        rawShape: input.mockResponse === undefined ? "dry-run" : "mock",
      },
      events: ["agentCore.modelAdapter.openai.v1.models.dryRun"],
    };
  }

  if (input.caller === undefined) {
    return failure(
      "CALLER_REQUIRED",
      "OpenAI v1 models live invocation requires an injected provider caller",
      "provider",
      false,
      request,
    );
  }

  try {
    const raw = await input.caller(request);
    if (input.expectResponseObject === true && !isRecord(raw)) {
      return failure(
        "RESPONSE_FORMAT_DRIFT",
        "OpenAI v1 models response did not match the expected object envelope",
        "response",
        false,
        request,
      );
    }

    return {
      ok: true,
      request,
      response: {
        provider: "openai",
        endpoint: OPENAI_V1_MODELS_ENDPOINT,
        mode: "caller",
        raw,
        providerFieldsOpaque: true,
      },
      capability: {
        provider: "openai",
        endpoint: OPENAI_V1_MODELS_ENDPOINT,
        operation: input.operation,
        rawShape: inferRawShape(input.operation, raw),
      },
      events: ["agentCore.modelAdapter.openai.v1.models.called"],
    };
  } catch (error) {
    const code = classifyOpenAIV1ModelsProviderError(error);
    return failure(
      code,
      `OpenAI v1 models provider caller failed with ${code}`,
      code === "RESPONSE_FORMAT_DRIFT" ? "response" : "provider",
      code === "PROVIDER_RATE_LIMITED" || code === "PROVIDER_TIMEOUT" || code === "PROVIDER_UNAVAILABLE",
      request,
    );
  }
}
