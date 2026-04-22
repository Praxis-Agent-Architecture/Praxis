/*
 * 文件定位：Agent 模型适配层 / 真实上游调用层 / OpenAI 官方调用面。
 * 核心目的：承接 OpenAI 上游的 v1 organization usage 真实调用面。
 * 能力要求1：需要把对应 endpoint 的请求参数、响应形态、错误形态和能力信号整理成可适配对象。
 * 能力要求2：鉴权/API 登录后续会接入，但这里要为“上游能力变得实际可用”预留位置。
 * 能力要求3：不把该 provider 的字段形状提升为 Praxis 统一语义，只作为 actualInvocationLayer 的现实入口。
 * 边界：只处理上游实际调用面，不在这里定义 agentCore 使用 AI 的统一方式。
 * 对接：需要被 runtime.modelAdapter 拉起，并和 provider/carrier、PromptPack lowering、能力抽象链路接通。
 * 实现提示：先补稳定类型契约、最小可测行为和清晰错误边界，再接入真实执行逻辑。
 */

export const OPENAI_V1_ORGANIZATION_USAGE_ENDPOINT = "/v1/organization/usage" as const;
export const DEFAULT_OPENAI_V1_ORGANIZATION_USAGE_BASE_URL = "https://api.openai.com" as const;

export type OpenAIV1OrganizationUsageMethod = "GET";

export type OpenAIV1OrganizationUsageBoundary =
  | "input"
  | "contract"
  | "governance"
  | "auth"
  | "scope"
  | "provider"
  | "response";

export type OpenAIV1OrganizationUsageErrorCode =
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

export type OpenAIV1OrganizationUsageGate = {
  accepted: boolean;
  reason?: string;
};

export type OpenAIV1OrganizationUsageRuntimeContext = {
  runtimeId?: string;
  invocationId?: string;
  traceId?: string;
  callerId?: string;
};

export type OpenAIV1OrganizationUsageAuthEnvelope = {
  kind: "bearer" | "api-key" | "none";
  present: boolean;
  redactedToken?: string;
  organizationId?: string;
};

export type OpenAIV1OrganizationUsageRequestEnvelope = {
  provider: "openai";
  apiVersion: "v1";
  endpoint: typeof OPENAI_V1_ORGANIZATION_USAGE_ENDPOINT;
  operation: string;
  method: OpenAIV1OrganizationUsageMethod;
  url: string;
  query: Readonly<Record<string, string>>;
  headers: Readonly<Record<string, string>>;
  runtime: Required<OpenAIV1OrganizationUsageRuntimeContext>;
  requestedScopes: readonly string[];
  grantedScopes: readonly string[];
  dryRun: true;
  providerCallPlanned: false;
  unsafeSideEffects: false;
  providerFieldsOpaque: true;
};

export type OpenAIV1OrganizationUsageInvocationRequest = {
  operation?: string;
  query?: Readonly<Record<string, string | number | boolean | undefined>>;
  headers?: Readonly<Record<string, string | undefined>>;
  baseUrl?: string;
  auth?: OpenAIV1OrganizationUsageAuthEnvelope;
  runtime?: OpenAIV1OrganizationUsageRuntimeContext;
  requiredScopes?: readonly string[];
  allowedScopes?: readonly string[];
  contract?: OpenAIV1OrganizationUsageGate;
  governance?: OpenAIV1OrganizationUsageGate;
  dryRun?: boolean;
  mockResponse?: unknown;
  expectResponseObject?: boolean;
  providerError?: unknown;
};

export type OpenAIV1OrganizationUsageResponseEnvelope = {
  provider: "openai";
  endpoint: typeof OPENAI_V1_ORGANIZATION_USAGE_ENDPOINT;
  mode: "dry-run" | "mock";
  raw: unknown;
  providerFieldsOpaque: true;
};

export type OpenAIV1OrganizationUsageCapabilitySignal = {
  provider: "openai";
  layer: "actualInvocationLayer";
  endpoint: typeof OPENAI_V1_ORGANIZATION_USAGE_ENDPOINT;
  operation: string;
  rawShape: "organization-usage-list" | "organization-usage-object" | "mock" | "dry-run";
  providerRawShapePromoted: false;
};

export type OpenAIV1OrganizationUsageError = {
  code: OpenAIV1OrganizationUsageErrorCode;
  message: string;
  boundary: OpenAIV1OrganizationUsageBoundary;
  retryable: boolean;
  safeForRuntimeInspection: true;
  providerRawDetailExposed: false;
};

export type OpenAIV1OrganizationUsageResult =
  | {
      ok: true;
      request: OpenAIV1OrganizationUsageRequestEnvelope;
      response: OpenAIV1OrganizationUsageResponseEnvelope;
      capability: OpenAIV1OrganizationUsageCapabilitySignal;
      events: readonly string[];
    }
  | {
      ok: false;
      error: OpenAIV1OrganizationUsageError;
      request?: OpenAIV1OrganizationUsageRequestEnvelope;
      events: readonly string[];
    };

export const openAIV1OrganizationUsageDescriptor = {
  provider: "openai",
  layer: "actualInvocationLayer",
  endpoint: OPENAI_V1_ORGANIZATION_USAGE_ENDPOINT,
  method: "GET",
  requestShape: "query",
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

function cleanQuery(query: OpenAIV1OrganizationUsageInvocationRequest["query"]): Readonly<Record<string, string>> {
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

function cleanHeaders(headers: OpenAIV1OrganizationUsageInvocationRequest["headers"]): Readonly<Record<string, string>> {
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
  return hasText(baseUrl) ? baseUrl.trim().replace(/\/+$/, "") : DEFAULT_OPENAI_V1_ORGANIZATION_USAGE_BASE_URL;
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
  code: OpenAIV1OrganizationUsageErrorCode,
  message: string,
  boundary: OpenAIV1OrganizationUsageBoundary,
  retryable = false,
  request?: OpenAIV1OrganizationUsageRequestEnvelope,
): OpenAIV1OrganizationUsageResult {
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
    events: ["agentCore.modelAdapter.openai.v1.organization.usage.rejected"],
  };
}

export function classifyOpenAIV1OrganizationUsageProviderError(error: unknown): OpenAIV1OrganizationUsageErrorCode {
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

function inferRawShape(operation: string, raw: unknown): OpenAIV1OrganizationUsageCapabilitySignal["rawShape"] {
  if (operation === "list" || (isRecord(raw) && Array.isArray(raw.data))) {
    return "organization-usage-list";
  }
  if (isRecord(raw)) {
    return "organization-usage-object";
  }
  return "mock";
}

export function createOpenAIV1OrganizationUsageInvocation(
  input: OpenAIV1OrganizationUsageInvocationRequest = {},
): OpenAIV1OrganizationUsageResult {
  if (!hasText(input.operation)) {
    return failure("MISSING_OPERATION", "OpenAI v1 organization usage invocation requires an explicit operation", "input");
  }

  const runtime = input.runtime;
  if (runtime === undefined || !hasText(runtime.runtimeId)) {
    return failure("MISSING_RUNTIME_ID", "OpenAI v1 organization usage invocation requires runtime.runtimeId", "input");
  }

  if (input.query !== undefined && !isRecord(input.query)) {
    return failure("INVALID_QUERY", "OpenAI v1 organization usage query must be a plain record", "input");
  }

  if (input.contract?.accepted === false) {
    return failure(
      "CONTRACT_REJECTED",
      input.contract.reason ?? "OpenAI v1 organization usage contract rejected the request",
      "contract",
    );
  }

  if (input.governance?.accepted === false) {
    return failure(
      "GOVERNANCE_REJECTED",
      input.governance.reason ?? "OpenAI v1 organization usage governance rejected the request",
      "governance",
    );
  }

  if (input.auth?.present === false) {
    return failure("AUTH_REJECTED", "OpenAI v1 organization usage auth envelope is unavailable", "auth");
  }

  const requestedScopes = cleanScopes(input.requiredScopes);
  const allowedScopes = cleanScopes(input.allowedScopes);
  const deniedScopes =
    allowedScopes.length === 0 ? [] : requestedScopes.filter((scope) => !allowedScopes.includes(scope));
  if (deniedScopes.length > 0) {
    return failure(
      "SCOPE_DENIED",
      `OpenAI v1 organization usage requested scopes outside the allowed boundary: ${deniedScopes.join(", ")}`,
      "scope",
    );
  }

  const operation = input.operation.trim();
  const request: OpenAIV1OrganizationUsageRequestEnvelope = {
    provider: "openai",
    apiVersion: "v1",
    endpoint: OPENAI_V1_ORGANIZATION_USAGE_ENDPOINT,
    operation,
    method: "GET",
    url: `${normalizeBaseUrl(input.baseUrl)}${OPENAI_V1_ORGANIZATION_USAGE_ENDPOINT}`,
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
    dryRun: true,
    providerCallPlanned: false,
    unsafeSideEffects: false,
    providerFieldsOpaque: true,
  };

  if (input.dryRun === false) {
    return failure(
      "REAL_PROVIDER_CALL_NOT_ALLOWED",
      "first-round OpenAI v1 organization usage invocation only builds dry-run or mock envelopes",
      "governance",
      false,
      request,
    );
  }

  if (input.providerError !== undefined) {
    const code = classifyOpenAIV1OrganizationUsageProviderError(input.providerError);
    return failure(
      code,
      `OpenAI v1 organization usage provider failed with ${code}`,
      code === "RESPONSE_FORMAT_DRIFT" ? "response" : "provider",
      code === "PROVIDER_RATE_LIMITED" || code === "PROVIDER_TIMEOUT" || code === "PROVIDER_UNAVAILABLE",
      request,
    );
  }

  if (input.expectResponseObject === true && input.mockResponse !== undefined && !isRecord(input.mockResponse)) {
    return failure(
      "RESPONSE_FORMAT_DRIFT",
      "OpenAI v1 organization usage mock response did not match the expected object envelope",
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
      endpoint: OPENAI_V1_ORGANIZATION_USAGE_ENDPOINT,
      mode: input.mockResponse === undefined ? "dry-run" : "mock",
      raw: input.mockResponse ?? null,
      providerFieldsOpaque: true,
    },
    capability: {
      provider: "openai",
      layer: "actualInvocationLayer",
      endpoint: OPENAI_V1_ORGANIZATION_USAGE_ENDPOINT,
      operation,
      rawShape: input.mockResponse === undefined ? "dry-run" : inferRawShape(operation, input.mockResponse),
      providerRawShapePromoted: false,
    },
    events: ["agentCore.modelAdapter.openai.v1.organization.usage.dryRun"],
  };
}
