/*
 * 文件定位：Agent 模型适配层 / 真实上游调用层 / OpenAI 官方调用面。
 * 核心目的：承接 OpenAI 上游的 v1 evals 真实调用面。
 * 能力要求1：需要把对应 endpoint 的请求参数、响应形态、错误形态和能力信号整理成可适配对象。
 * 能力要求2：鉴权/API 登录后续会接入，但这里要为“上游能力变得实际可用”预留位置。
 * 能力要求3：不把该 provider 的字段形状提升为 Praxis 统一语义，只作为 actualInvocationLayer 的现实入口。
 * 边界：只处理上游实际调用面，不在这里定义 agentCore 使用 AI 的统一方式。
 * 对接：需要被 runtime.modelAdapter 拉起，并和 provider/carrier、PromptPack lowering、能力抽象链路接通。
 * 实现提示：先补稳定类型契约、最小可测行为和清晰错误边界，再接入真实执行逻辑。
 */

export const OPENAI_V1_EVALS_ENDPOINT = "/v1/evals" as const;

export type OpenAIV1EvalsMethod = "GET" | "POST" | "PATCH" | "DELETE";

export type OpenAIV1EvalsGate = {
  accepted: boolean;
  reason?: string;
};

export type OpenAIV1EvalsRuntimeContext = {
  runtimeId?: string;
  correlationId?: string;
  callerId?: string;
};

export type OpenAIV1EvalsAuthEnvelope = {
  kind: "api-key" | "bearer" | "none";
  present: boolean;
  redactedToken?: string;
};

export type OpenAIV1EvalsRequestEnvelope = {
  provider: "openai";
  apiVersion: "v1";
  endpoint: typeof OPENAI_V1_EVALS_ENDPOINT;
  operation: string;
  method: OpenAIV1EvalsMethod;
  urlPath: string;
  query: Readonly<Record<string, string>>;
  headers: Readonly<Record<string, string>>;
  body?: unknown;
  runtime: Required<OpenAIV1EvalsRuntimeContext>;
  requestedScopes: readonly string[];
  grantedScopes: readonly string[];
  dryRun: boolean;
  unsafeSideEffects: false;
  providerFieldsOpaque: true;
};

export type OpenAIV1EvalsProviderCaller = (envelope: OpenAIV1EvalsRequestEnvelope) => unknown | Promise<unknown>;

export type OpenAIV1EvalsInvocationRequest = {
  operation?: string;
  method?: OpenAIV1EvalsMethod;
  pathSuffix?: string;
  query?: Readonly<Record<string, string | number | boolean | undefined>>;
  headers?: Readonly<Record<string, string | undefined>>;
  body?: unknown;
  auth?: OpenAIV1EvalsAuthEnvelope;
  runtime?: OpenAIV1EvalsRuntimeContext;
  requiredScopes?: readonly string[];
  allowedScopes?: readonly string[];
  contract?: OpenAIV1EvalsGate;
  governance?: OpenAIV1EvalsGate;
  dryRun?: boolean;
  mockResponse?: unknown;
  expectResponseObject?: boolean;
  caller?: OpenAIV1EvalsProviderCaller;
};

export type OpenAIV1EvalsErrorCode =
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

export type OpenAIV1EvalsError = {
  code: OpenAIV1EvalsErrorCode;
  message: string;
  boundary: "input" | "contract" | "governance" | "auth" | "scope" | "provider";
  retryable: boolean;
};

export type OpenAIV1EvalsProviderResponseEnvelope = {
  provider: "openai";
  endpoint: typeof OPENAI_V1_EVALS_ENDPOINT;
  mode: "dry-run" | "mock" | "caller";
  raw: unknown;
  providerFieldsOpaque: true;
};

export type OpenAIV1EvalsInvocationResult =
  | {
      ok: true;
      request: OpenAIV1EvalsRequestEnvelope;
      response: OpenAIV1EvalsProviderResponseEnvelope;
      events: readonly string[];
    }
  | {
      ok: false;
      error: OpenAIV1EvalsError;
      request?: OpenAIV1EvalsRequestEnvelope;
      events: readonly string[];
    };

function hasText(value: string | undefined): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

function cleanScopes(scopes: readonly string[] | undefined): readonly string[] {
  return [...new Set((scopes ?? []).map((scope) => scope.trim()).filter(Boolean))];
}

function cleanQuery(query: OpenAIV1EvalsInvocationRequest["query"]): Readonly<Record<string, string>> {
  return Object.fromEntries(
    Object.entries(query ?? {})
      .filter((entry): entry is [string, string | number | boolean] => entry[1] !== undefined)
      .map(([key, value]) => [key.trim(), String(value)]),
  );
}

function cleanHeaders(headers: OpenAIV1EvalsInvocationRequest["headers"]): Readonly<Record<string, string>> {
  return Object.fromEntries(
    Object.entries(headers ?? {})
      .filter((entry): entry is [string, string] => typeof entry[1] === "string" && entry[1].trim().length > 0)
      .map(([key, value]) => [key.trim().toLowerCase(), value.trim()]),
  );
}

function buildUrlPath(pathSuffix: string | undefined): string {
  const suffix = pathSuffix?.trim().replace(/^\/+/, "").replace(/\/+$/, "");
  return suffix ? `${OPENAI_V1_EVALS_ENDPOINT}/${suffix}` : OPENAI_V1_EVALS_ENDPOINT;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
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

function failure(
  code: OpenAIV1EvalsErrorCode,
  message: string,
  boundary: OpenAIV1EvalsError["boundary"],
  retryable = false,
  request?: OpenAIV1EvalsRequestEnvelope,
): OpenAIV1EvalsInvocationResult {
  return {
    ok: false,
    error: { code, message, boundary, retryable },
    request,
    events: ["agentCore.modelAdapter.openai.v1.evals.rejected"],
  };
}

export function classifyOpenAIV1EvalsProviderError(error: unknown): OpenAIV1EvalsErrorCode {
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

export async function invokeOpenAIV1Evals(
  input: OpenAIV1EvalsInvocationRequest = {},
): Promise<OpenAIV1EvalsInvocationResult> {
  if (!hasText(input.operation)) {
    return failure("MISSING_OPERATION", "OpenAI v1 evals invocation requires an explicit operation", "input");
  }

  if (!hasText(input.runtime?.runtimeId)) {
    return failure("MISSING_RUNTIME_ID", "OpenAI v1 evals invocation requires runtime.runtimeId", "input");
  }

  const operation = input.operation.trim();
  const runtime = input.runtime;
  const runtimeId = input.runtime.runtimeId.trim();

  if (input.contract?.accepted === false) {
    return failure("CONTRACT_REJECTED", input.contract.reason ?? "OpenAI v1 evals contract rejected the request", "contract");
  }

  if (input.governance?.accepted === false) {
    return failure(
      "GOVERNANCE_REJECTED",
      input.governance.reason ?? "OpenAI v1 evals governance rejected the request",
      "governance",
    );
  }

  if (input.auth?.present === false) {
    return failure("AUTH_REJECTED", "OpenAI v1 evals auth envelope is marked as unavailable", "auth");
  }

  const requestedScopes = cleanScopes(input.requiredScopes);
  const allowedScopes = cleanScopes(input.allowedScopes);
  const deniedScopes =
    allowedScopes.length === 0 ? [] : requestedScopes.filter((scope) => !allowedScopes.includes(scope));

  if (deniedScopes.length > 0) {
    return failure(
      "SCOPE_DENIED",
      `OpenAI v1 evals invocation requested scopes outside the allowed boundary: ${deniedScopes.join(", ")}`,
      "scope",
    );
  }

  const request: OpenAIV1EvalsRequestEnvelope = {
    provider: "openai",
    apiVersion: "v1",
    endpoint: OPENAI_V1_EVALS_ENDPOINT,
    operation,
    method: input.method ?? "GET",
    urlPath: buildUrlPath(input.pathSuffix),
    query: cleanQuery(input.query),
    headers: cleanHeaders(input.headers),
    body: input.body,
    runtime: {
      runtimeId,
      correlationId: runtime.correlationId?.trim() || "",
      callerId: runtime.callerId?.trim() || "",
    },
    requestedScopes,
    grantedScopes: requestedScopes,
    dryRun: input.dryRun !== false,
    unsafeSideEffects: false,
    providerFieldsOpaque: true,
  };

  if (request.dryRun) {
    return {
      ok: true,
      request,
      response: {
        provider: "openai",
        endpoint: OPENAI_V1_EVALS_ENDPOINT,
        mode: input.mockResponse === undefined ? "dry-run" : "mock",
        raw: input.mockResponse ?? null,
        providerFieldsOpaque: true,
      },
      events: ["agentCore.modelAdapter.openai.v1.evals.dryRun"],
    };
  }

  if (input.caller === undefined) {
    return failure("CALLER_REQUIRED", "OpenAI v1 evals live invocation requires an injected provider caller", "provider", false, request);
  }

  try {
    const raw = await input.caller(request);
    if (input.expectResponseObject === true && !isRecord(raw)) {
      return failure(
        "RESPONSE_FORMAT_DRIFT",
        "OpenAI v1 evals provider response did not match the expected object envelope",
        "provider",
        false,
        request,
      );
    }

    return {
      ok: true,
      request,
      response: {
        provider: "openai",
        endpoint: OPENAI_V1_EVALS_ENDPOINT,
        mode: "caller",
        raw,
        providerFieldsOpaque: true,
      },
      events: ["agentCore.modelAdapter.openai.v1.evals.called"],
    };
  } catch (error) {
    const code = classifyOpenAIV1EvalsProviderError(error);
    return failure(
      code,
      `OpenAI v1 evals provider caller failed with ${code}`,
      "provider",
      code === "PROVIDER_RATE_LIMITED" || code === "PROVIDER_TIMEOUT" || code === "PROVIDER_UNAVAILABLE",
      request,
    );
  }
}
