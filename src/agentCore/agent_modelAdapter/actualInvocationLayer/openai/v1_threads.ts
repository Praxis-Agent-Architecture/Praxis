/*
 * 文件定位：Agent 模型适配层 / 真实上游调用层 / OpenAI 官方调用面。
 * 核心目的：承接 OpenAI 上游的 v1 threads 真实调用面。
 * 能力要求1：需要把对应 endpoint 的请求参数、响应形态、错误形态和能力信号整理成可适配对象。
 * 能力要求2：鉴权/API 登录后续会接入，但这里要为“上游能力变得实际可用”预留位置。
 * 能力要求3：不把该 provider 的字段形状提升为 Praxis 统一语义，只作为 actualInvocationLayer 的现实入口。
 * 边界：只处理上游实际调用面，不在这里定义 agentCore 使用 AI 的统一方式。
 * 对接：需要被 runtime.modelAdapter 拉起，并和 provider/carrier、PromptPack lowering、能力抽象链路接通。
 * 实现提示：先补稳定类型契约、最小可测行为和清晰错误边界，再接入真实执行逻辑。
 */

export const OPENAI_V1_THREADS_ENDPOINT = "/v1/threads" as const;
export const DEFAULT_OPENAI_V1_THREADS_BASE_URL = "https://api.openai.com" as const;

export type OpenAIV1ThreadsMethod = "GET" | "POST" | "PATCH" | "DELETE";

export type OpenAIV1ThreadsBoundary =
  | "input"
  | "contract"
  | "governance"
  | "auth"
  | "scope"
  | "provider"
  | "response";

export type OpenAIV1ThreadsErrorCode =
  | "MISSING_OPERATION"
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

export type OpenAIV1ThreadsGate = {
  accepted: boolean;
  reason?: string;
};

export type OpenAIV1ThreadsRuntimeContext = {
  runtimeId?: string;
  invocationId?: string;
  traceId?: string;
  callerId?: string;
};

export type OpenAIV1ThreadsAuthEnvelope = {
  kind: "bearer" | "api-key" | "none";
  present: boolean;
  redactedToken?: string;
};

export type OpenAIV1ThreadsRequestEnvelope = {
  provider: "openai";
  apiVersion: "v1";
  endpoint: typeof OPENAI_V1_THREADS_ENDPOINT;
  operation: string;
  method: OpenAIV1ThreadsMethod;
  url: string;
  pathSuffix: string;
  query: Readonly<Record<string, string>>;
  headers: Readonly<Record<string, string>>;
  body?: unknown;
  runtime: Required<OpenAIV1ThreadsRuntimeContext>;
  requestedScopes: readonly string[];
  grantedScopes: readonly string[];
  dryRun: boolean;
  providerCallPlanned: boolean;
  unsafeSideEffects: false;
  providerFieldsOpaque: true;
};

export type OpenAIV1ThreadsProviderCaller = (envelope: OpenAIV1ThreadsRequestEnvelope) => unknown | Promise<unknown>;

export type OpenAIV1ThreadsInvocationRequest = {
  operation?: string;
  method?: OpenAIV1ThreadsMethod;
  pathSuffix?: string;
  query?: Readonly<Record<string, string | number | boolean | undefined>>;
  headers?: Readonly<Record<string, string | undefined>>;
  body?: unknown;
  baseUrl?: string;
  auth?: OpenAIV1ThreadsAuthEnvelope;
  runtime?: OpenAIV1ThreadsRuntimeContext;
  requiredScopes?: readonly string[];
  allowedScopes?: readonly string[];
  contract?: OpenAIV1ThreadsGate;
  governance?: OpenAIV1ThreadsGate;
  dryRun?: boolean;
  mockResponse?: unknown;
  expectResponseObject?: boolean;
  caller?: OpenAIV1ThreadsProviderCaller;
};

export type OpenAIV1ThreadsResponseEnvelope = {
  provider: "openai";
  endpoint: typeof OPENAI_V1_THREADS_ENDPOINT;
  mode: "dry-run" | "mock" | "caller";
  raw: unknown;
  providerFieldsOpaque: true;
};

export type OpenAIV1ThreadsCapabilitySignal = {
  provider: "openai";
  endpoint: typeof OPENAI_V1_THREADS_ENDPOINT;
  operation: string;
  rawShape: "thread-object" | "thread-list" | "mock" | "dry-run";
};

export type OpenAIV1ThreadsError = {
  code: OpenAIV1ThreadsErrorCode;
  message: string;
  boundary: OpenAIV1ThreadsBoundary;
  retryable: boolean;
};

export type OpenAIV1ThreadsResult =
  | {
      ok: true;
      request: OpenAIV1ThreadsRequestEnvelope;
      response: OpenAIV1ThreadsResponseEnvelope;
      capability: OpenAIV1ThreadsCapabilitySignal;
      events: readonly string[];
    }
  | {
      ok: false;
      error: OpenAIV1ThreadsError;
      request?: OpenAIV1ThreadsRequestEnvelope;
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

function cleanQuery(query: OpenAIV1ThreadsInvocationRequest["query"]): Readonly<Record<string, string>> {
  return Object.fromEntries(
    Object.entries(query ?? {})
      .filter((entry): entry is [string, string | number | boolean] => entry[1] !== undefined)
      .map(([key, value]) => [key.trim(), String(value)]),
  );
}

function cleanHeaders(headers: OpenAIV1ThreadsInvocationRequest["headers"]): Readonly<Record<string, string>> {
  return Object.fromEntries(
    Object.entries(headers ?? {})
      .filter((entry): entry is [string, string] => typeof entry[1] === "string" && entry[1].trim().length > 0)
      .map(([key, value]) => [key.trim().toLowerCase(), value.trim()]),
  );
}

function normalizeBaseUrl(baseUrl: string | undefined): string {
  return hasText(baseUrl) ? baseUrl.trim().replace(/\/+$/, "") : DEFAULT_OPENAI_V1_THREADS_BASE_URL;
}

function cleanPathSuffix(pathSuffix: string | undefined): string {
  return pathSuffix?.trim().replace(/^\/+/, "").replace(/\/+$/, "") ?? "";
}

function buildUrl(baseUrl: string | undefined, pathSuffix: string | undefined): string {
  const suffix = cleanPathSuffix(pathSuffix);
  return suffix
    ? `${normalizeBaseUrl(baseUrl)}${OPENAI_V1_THREADS_ENDPOINT}/${suffix}`
    : `${normalizeBaseUrl(baseUrl)}${OPENAI_V1_THREADS_ENDPOINT}`;
}

function failure(
  code: OpenAIV1ThreadsErrorCode,
  message: string,
  boundary: OpenAIV1ThreadsBoundary,
  retryable = false,
  request?: OpenAIV1ThreadsRequestEnvelope,
): OpenAIV1ThreadsResult {
  return {
    ok: false,
    error: { code, message, boundary, retryable },
    request,
    events: ["agentCore.modelAdapter.openai.v1.threads.rejected"],
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

function inferRawShape(operation: string, raw: unknown): OpenAIV1ThreadsCapabilitySignal["rawShape"] {
  if (operation === "list" || (isRecord(raw) && Array.isArray(raw.data))) {
    return "thread-list";
  }

  return "thread-object";
}

export function classifyOpenAIV1ThreadsProviderError(error: unknown): OpenAIV1ThreadsErrorCode {
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

export async function invokeOpenAIV1Threads(input: OpenAIV1ThreadsInvocationRequest = {}): Promise<OpenAIV1ThreadsResult> {
  if (!hasText(input.operation)) {
    return failure("MISSING_OPERATION", "OpenAI v1 threads invocation requires an explicit operation", "input");
  }

  const runtime = input.runtime;
  if (runtime === undefined || !hasText(runtime.runtimeId)) {
    return failure("MISSING_RUNTIME_ID", "OpenAI v1 threads invocation requires runtime.runtimeId", "input");
  }

  if (input.contract?.accepted === false) {
    return failure(
      "CONTRACT_REJECTED",
      input.contract.reason ?? "OpenAI v1 threads contract rejected the request",
      "contract",
    );
  }

  if (input.governance?.accepted === false) {
    return failure(
      "GOVERNANCE_REJECTED",
      input.governance.reason ?? "OpenAI v1 threads governance rejected the request",
      "governance",
    );
  }

  if (input.auth?.present === false) {
    return failure("AUTH_REJECTED", "OpenAI v1 threads auth envelope is unavailable", "auth");
  }

  const requestedScopes = cleanScopes(input.requiredScopes);
  const allowedScopes = cleanScopes(input.allowedScopes);
  const deniedScopes =
    allowedScopes.length === 0 ? [] : requestedScopes.filter((scope) => !allowedScopes.includes(scope));

  if (deniedScopes.length > 0) {
    return failure(
      "SCOPE_DENIED",
      `OpenAI v1 threads requested scopes outside the allowed boundary: ${deniedScopes.join(", ")}`,
      "scope",
    );
  }

  const operation = input.operation.trim();
  const pathSuffix = cleanPathSuffix(input.pathSuffix);
  const request: OpenAIV1ThreadsRequestEnvelope = {
    provider: "openai",
    apiVersion: "v1",
    endpoint: OPENAI_V1_THREADS_ENDPOINT,
    operation,
    method: input.method ?? "POST",
    url: buildUrl(input.baseUrl, input.pathSuffix),
    pathSuffix,
    query: cleanQuery(input.query),
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
    return {
      ok: true,
      request,
      response: {
        provider: "openai",
        endpoint: OPENAI_V1_THREADS_ENDPOINT,
        mode: input.mockResponse === undefined ? "dry-run" : "mock",
        raw: input.mockResponse ?? null,
        providerFieldsOpaque: true,
      },
      capability: {
        provider: "openai",
        endpoint: OPENAI_V1_THREADS_ENDPOINT,
        operation,
        rawShape: input.mockResponse === undefined ? "dry-run" : "mock",
      },
      events: ["agentCore.modelAdapter.openai.v1.threads.dryRun"],
    };
  }

  if (input.caller === undefined) {
    return failure(
      "CALLER_REQUIRED",
      "OpenAI v1 threads live invocation requires an injected provider caller",
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
        "OpenAI v1 threads response did not match the expected object envelope",
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
        endpoint: OPENAI_V1_THREADS_ENDPOINT,
        mode: "caller",
        raw,
        providerFieldsOpaque: true,
      },
      capability: {
        provider: "openai",
        endpoint: OPENAI_V1_THREADS_ENDPOINT,
        operation,
        rawShape: inferRawShape(operation, raw),
      },
      events: ["agentCore.modelAdapter.openai.v1.threads.called"],
    };
  } catch (error) {
    const code = classifyOpenAIV1ThreadsProviderError(error);
    return failure(
      code,
      `OpenAI v1 threads provider caller failed with ${code}`,
      code === "RESPONSE_FORMAT_DRIFT" ? "response" : "provider",
      code === "PROVIDER_RATE_LIMITED" || code === "PROVIDER_TIMEOUT" || code === "PROVIDER_UNAVAILABLE",
      request,
    );
  }
}
