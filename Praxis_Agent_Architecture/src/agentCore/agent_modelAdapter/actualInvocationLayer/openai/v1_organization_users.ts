/*
 * 文件定位：Agent 模型适配层 / 真实上游调用层 / OpenAI 官方调用面。
 * 核心目的：承接 OpenAI 上游的 v1 organization users 真实调用面。
 * 能力要求1：需要把对应 endpoint 的请求参数、响应形态、错误形态和能力信号整理成可适配对象。
 * 能力要求2：鉴权/API 登录后续会接入，但这里要为“上游能力变得实际可用”预留位置。
 * 能力要求3：不把该 provider 的字段形状提升为 Praxis 统一语义，只作为 actualInvocationLayer 的现实入口。
 * 边界：只处理上游实际调用面，不在这里定义 agentCore 使用 AI 的统一方式。
 * 对接：需要被 runtime.modelAdapter 拉起，并和 provider/carrier、PromptPack lowering、能力抽象链路接通。
 * 实现提示：先补稳定类型契约、最小可测行为和清晰错误边界，再接入真实执行逻辑。
 */

export const OPENAI_V1_ORGANIZATION_USERS_ENDPOINT = "/v1/organization/users" as const;
export const DEFAULT_OPENAI_V1_ORGANIZATION_USERS_BASE_URL = "https://api.openai.com" as const;

export type OpenAIV1OrganizationUsersMethod = "GET" | "POST" | "PATCH" | "DELETE";

export type OpenAIV1OrganizationUsersBoundary =
  | "input"
  | "contract"
  | "governance"
  | "auth"
  | "scope"
  | "provider"
  | "response";

export type OpenAIV1OrganizationUsersErrorCode =
  | "MISSING_OPERATION"
  | "MISSING_RUNTIME_ID"
  | "INVALID_QUERY"
  | "CONTRACT_REJECTED"
  | "GOVERNANCE_REJECTED"
  | "SCOPE_DENIED"
  | "AUTH_REJECTED"
  | "REAL_PROVIDER_CALL_NOT_ALLOWED"
  | "PROVIDER_AUTH_FAILED"
  | "PROVIDER_RATE_LIMITED"
  | "PROVIDER_TIMEOUT"
  | "PROVIDER_UNAVAILABLE"
  | "RESPONSE_FORMAT_DRIFT"
  | "PROVIDER_REJECTED";

export type OpenAIV1OrganizationUsersGate = {
  accepted: boolean;
  reason?: string;
};

export type OpenAIV1OrganizationUsersRuntimeContext = {
  runtimeId?: string;
  invocationId?: string;
  traceId?: string;
  callerId?: string;
};

export type OpenAIV1OrganizationUsersAuthEnvelope = {
  kind: "bearer" | "api-key" | "none";
  present: boolean;
  redactedToken?: string;
  organizationId?: string;
};

export type OpenAIV1OrganizationUsersRequestEnvelope = {
  provider: "openai";
  apiVersion: "v1";
  endpoint: typeof OPENAI_V1_ORGANIZATION_USERS_ENDPOINT;
  operation: string;
  method: OpenAIV1OrganizationUsersMethod;
  url: string;
  pathSuffix: string;
  query: Readonly<Record<string, string>>;
  headers: Readonly<Record<string, string>>;
  body?: unknown;
  runtime: Required<OpenAIV1OrganizationUsersRuntimeContext>;
  requestedScopes: readonly string[];
  grantedScopes: readonly string[];
  dryRun: true;
  providerCallPlanned: false;
  unsafeSideEffects: false;
  providerFieldsOpaque: true;
};

export type OpenAIV1OrganizationUsersInvocationRequest = {
  operation?: string;
  method?: OpenAIV1OrganizationUsersMethod;
  pathSuffix?: string;
  query?: Readonly<Record<string, string | number | boolean | undefined>>;
  headers?: Readonly<Record<string, string | undefined>>;
  body?: unknown;
  baseUrl?: string;
  auth?: OpenAIV1OrganizationUsersAuthEnvelope;
  runtime?: OpenAIV1OrganizationUsersRuntimeContext;
  requiredScopes?: readonly string[];
  allowedScopes?: readonly string[];
  contract?: OpenAIV1OrganizationUsersGate;
  governance?: OpenAIV1OrganizationUsersGate;
  dryRun?: boolean;
  mockResponse?: unknown;
  expectResponseObject?: boolean;
  providerError?: unknown;
};

export type OpenAIV1OrganizationUsersResponseEnvelope = {
  provider: "openai";
  endpoint: typeof OPENAI_V1_ORGANIZATION_USERS_ENDPOINT;
  mode: "dry-run" | "mock";
  raw: unknown;
  providerFieldsOpaque: true;
};

export type OpenAIV1OrganizationUsersCapabilitySignal = {
  provider: "openai";
  layer: "actualInvocationLayer";
  endpoint: typeof OPENAI_V1_ORGANIZATION_USERS_ENDPOINT;
  operation: string;
  rawShape: "organization-users-list" | "organization-user-object" | "mock" | "dry-run";
  providerRawShapePromoted: false;
};

export type OpenAIV1OrganizationUsersError = {
  code: OpenAIV1OrganizationUsersErrorCode;
  message: string;
  boundary: OpenAIV1OrganizationUsersBoundary;
  retryable: boolean;
  safeForRuntimeInspection: true;
  providerRawDetailExposed: false;
};

export type OpenAIV1OrganizationUsersResult =
  | {
      ok: true;
      request: OpenAIV1OrganizationUsersRequestEnvelope;
      response: OpenAIV1OrganizationUsersResponseEnvelope;
      capability: OpenAIV1OrganizationUsersCapabilitySignal;
      events: readonly string[];
    }
  | {
      ok: false;
      error: OpenAIV1OrganizationUsersError;
      request?: OpenAIV1OrganizationUsersRequestEnvelope;
      events: readonly string[];
    };

export const openAIV1OrganizationUsersDescriptor = {
  provider: "openai",
  layer: "actualInvocationLayer",
  endpoint: OPENAI_V1_ORGANIZATION_USERS_ENDPOINT,
  methods: ["GET", "POST", "PATCH", "DELETE"],
  requestShape: "query-or-json",
  providerRawShapePromoted: false,
  unsafeSideEffects: false,
} as const;

function hasText(value: string | undefined): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function cleanScopes(scopes: readonly string[] | undefined): readonly string[] {
  return [...new Set((scopes ?? []).map((scope) => scope.trim()).filter(Boolean))];
}

function cleanQuery(query: OpenAIV1OrganizationUsersInvocationRequest["query"]): Readonly<Record<string, string>> {
  const cleaned: Record<string, string> = {};
  for (const [rawKey, rawValue] of Object.entries(query ?? {})) {
    const key = rawKey.trim();
    if (key.length === 0 || rawValue === undefined) {
      continue;
    }
    cleaned[key] = String(rawValue);
  }
  return cleaned;
}

function cleanHeaders(headers: OpenAIV1OrganizationUsersInvocationRequest["headers"]): Readonly<Record<string, string>> {
  const cleaned: Record<string, string> = {};
  for (const [rawKey, rawValue] of Object.entries(headers ?? {})) {
    const key = rawKey.trim().toLowerCase();
    const value = rawValue?.trim();
    if (key.length > 0 && value !== undefined && value.length > 0) {
      cleaned[key] = value;
    }
  }
  return cleaned;
}

function normalizeBaseUrl(baseUrl: string | undefined): string {
  return hasText(baseUrl) ? baseUrl.trim().replace(/\/+$/, "") : DEFAULT_OPENAI_V1_ORGANIZATION_USERS_BASE_URL;
}

function cleanPathSuffix(pathSuffix: string | undefined): string {
  return pathSuffix?.trim().replace(/^\/+/, "").replace(/\/+$/, "") ?? "";
}

function buildUrl(baseUrl: string | undefined, pathSuffix: string | undefined): string {
  const suffix = cleanPathSuffix(pathSuffix);
  return suffix
    ? `${normalizeBaseUrl(baseUrl)}${OPENAI_V1_ORGANIZATION_USERS_ENDPOINT}/${suffix}`
    : `${normalizeBaseUrl(baseUrl)}${OPENAI_V1_ORGANIZATION_USERS_ENDPOINT}`;
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
  code: OpenAIV1OrganizationUsersErrorCode,
  message: string,
  boundary: OpenAIV1OrganizationUsersBoundary,
  retryable = false,
  request?: OpenAIV1OrganizationUsersRequestEnvelope,
): OpenAIV1OrganizationUsersResult {
  return {
    ok: false,
    error: {
      code,
      message,
      boundary,
      retryable,
      safeForRuntimeInspection: true,
      providerRawDetailExposed: false,
    },
    request,
    events: ["agentCore.modelAdapter.openai.v1.organization.users.rejected"],
  };
}

export function classifyOpenAIV1OrganizationUsersProviderError(error: unknown): OpenAIV1OrganizationUsersErrorCode {
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
  if ((status !== undefined && status >= 500) || status === 404) {
    return "PROVIDER_UNAVAILABLE";
  }
  if (code.includes("format") || code.includes("schema") || code.includes("parse")) {
    return "RESPONSE_FORMAT_DRIFT";
  }
  return "PROVIDER_REJECTED";
}

function inferRawShape(operation: string, raw: unknown): OpenAIV1OrganizationUsersCapabilitySignal["rawShape"] {
  if (operation === "list" || (isRecord(raw) && Array.isArray(raw.data))) {
    return "organization-users-list";
  }
  if (isRecord(raw)) {
    return "organization-user-object";
  }
  return "mock";
}

export function createOpenAIV1OrganizationUsersInvocation(
  input: OpenAIV1OrganizationUsersInvocationRequest = {},
): OpenAIV1OrganizationUsersResult {
  if (!hasText(input.operation)) {
    return failure("MISSING_OPERATION", "OpenAI v1 organization users invocation requires an explicit operation", "input");
  }

  const runtime = input.runtime;
  if (runtime === undefined || !hasText(runtime.runtimeId)) {
    return failure("MISSING_RUNTIME_ID", "OpenAI v1 organization users invocation requires runtime.runtimeId", "input");
  }

  if (input.query !== undefined && !isRecord(input.query)) {
    return failure("INVALID_QUERY", "OpenAI v1 organization users query must be a plain record", "input");
  }

  if (input.contract?.accepted === false) {
    return failure(
      "CONTRACT_REJECTED",
      input.contract.reason ?? "OpenAI v1 organization users contract rejected the request",
      "contract",
    );
  }

  if (input.governance?.accepted === false) {
    return failure(
      "GOVERNANCE_REJECTED",
      input.governance.reason ?? "OpenAI v1 organization users governance rejected the request",
      "governance",
    );
  }

  if (input.auth?.present === false) {
    return failure("AUTH_REJECTED", "OpenAI v1 organization users auth envelope is unavailable", "auth");
  }

  const requestedScopes = cleanScopes(input.requiredScopes);
  const allowedScopes = cleanScopes(input.allowedScopes);
  const deniedScopes =
    allowedScopes.length === 0 ? [] : requestedScopes.filter((scope) => !allowedScopes.includes(scope));
  if (deniedScopes.length > 0) {
    return failure(
      "SCOPE_DENIED",
      `OpenAI v1 organization users requested scopes outside the allowed boundary: ${deniedScopes.join(", ")}`,
      "scope",
    );
  }

  const operation = input.operation.trim();
  const request: OpenAIV1OrganizationUsersRequestEnvelope = {
    provider: "openai",
    apiVersion: "v1",
    endpoint: OPENAI_V1_ORGANIZATION_USERS_ENDPOINT,
    operation,
    method: input.method ?? "GET",
    url: buildUrl(input.baseUrl, input.pathSuffix),
    pathSuffix: cleanPathSuffix(input.pathSuffix),
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
    dryRun: true,
    providerCallPlanned: false,
    unsafeSideEffects: false,
    providerFieldsOpaque: true,
  };

  if (input.dryRun === false) {
    return failure(
      "REAL_PROVIDER_CALL_NOT_ALLOWED",
      "first-round OpenAI v1 organization users invocation only builds dry-run or mock envelopes",
      "governance",
      false,
      request,
    );
  }

  if (input.providerError !== undefined) {
    const code = classifyOpenAIV1OrganizationUsersProviderError(input.providerError);
    return failure(
      code,
      `OpenAI v1 organization users provider failed with ${code}`,
      code === "RESPONSE_FORMAT_DRIFT" ? "response" : "provider",
      code === "PROVIDER_RATE_LIMITED" || code === "PROVIDER_TIMEOUT" || code === "PROVIDER_UNAVAILABLE",
      request,
    );
  }

  if (input.expectResponseObject === true && input.mockResponse !== undefined && !isRecord(input.mockResponse)) {
    return failure(
      "RESPONSE_FORMAT_DRIFT",
      "OpenAI v1 organization users mock response did not match the expected object envelope",
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
      endpoint: OPENAI_V1_ORGANIZATION_USERS_ENDPOINT,
      mode: input.mockResponse === undefined ? "dry-run" : "mock",
      raw: input.mockResponse ?? null,
      providerFieldsOpaque: true,
    },
    capability: {
      provider: "openai",
      layer: "actualInvocationLayer",
      endpoint: OPENAI_V1_ORGANIZATION_USERS_ENDPOINT,
      operation,
      rawShape: input.mockResponse === undefined ? "dry-run" : inferRawShape(operation, input.mockResponse),
      providerRawShapePromoted: false,
    },
    events: ["agentCore.modelAdapter.openai.v1.organization.users.dryRun"],
  };
}
