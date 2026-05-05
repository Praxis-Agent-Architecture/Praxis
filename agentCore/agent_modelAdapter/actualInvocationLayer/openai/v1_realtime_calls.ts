/*
 * 文件定位：Agent 模型适配层 / 真实上游调用层 / OpenAI 官方调用面。
 * 核心目的：承接 OpenAI 上游的 v1 realtime calls 真实调用面。
 * 能力要求1：需要把对应 endpoint 的请求参数、响应形态、错误形态和能力信号整理成可适配对象。
 * 能力要求2：鉴权/API 登录后续会接入，但这里要为“上游能力变得实际可用”预留位置。
 * 能力要求3：不把该 provider 的字段形状提升为 Praxis 统一语义，只作为 actualInvocationLayer 的现实入口。
 * 边界：只处理上游实际调用面，不在这里定义 agentCore 使用 AI 的统一方式。
 * 对接：需要被 runtime.modelAdapter 拉起，并和 provider/carrier、PromptPack lowering、能力抽象链路接通。
 * 实现提示：先补稳定类型契约、最小可测行为和清晰错误边界，再接入真实执行逻辑。
 */

export const OPENAI_V1_REALTIME_CALLS_ENDPOINT = "/v1/realtime/calls" as const;
export const DEFAULT_OPENAI_V1_REALTIME_CALLS_BASE_URL = "https://api.openai.com" as const;

export type OpenAIV1RealtimeCallsMethod = "POST";

export type OpenAIV1RealtimeCallsBoundary =
  | "input"
  | "contract"
  | "governance"
  | "auth"
  | "scope"
  | "provider"
  | "response";

export type OpenAIV1RealtimeCallsErrorCode =
  | "MISSING_REQUEST_BODY"
  | "INVALID_REQUEST_BODY"
  | "MISSING_RUNTIME_ID"
  | "INVALID_TIMEOUT"
  | "CONTRACT_REJECTED"
  | "GOVERNANCE_REJECTED"
  | "AUTH_REJECTED"
  | "SCOPE_DENIED"
  | "CALLER_REQUIRED"
  | "PROVIDER_AUTH_FAILED"
  | "PROVIDER_RATE_LIMITED"
  | "PROVIDER_TIMEOUT"
  | "PROVIDER_UNAVAILABLE"
  | "RESPONSE_FORMAT_DRIFT"
  | "CALLER_FAILED";

export type OpenAIV1RealtimeCallsGate = {
  accepted: boolean;
  reason?: string;
};

export type OpenAIV1RealtimeCallsRuntimeContext = {
  runtimeId?: string;
  invocationId?: string;
  traceId?: string;
  callerId?: string;
};

export type OpenAIV1RealtimeCallsAuthEnvelope = {
  kind: "bearer" | "api-key" | "none";
  present: boolean;
  redactedToken?: string;
};

export type OpenAIV1RealtimeCallsRequestEnvelope = {
  provider: "openai";
  apiVersion: "v1";
  endpoint: typeof OPENAI_V1_REALTIME_CALLS_ENDPOINT;
  method: OpenAIV1RealtimeCallsMethod;
  url: string;
  requestBody: Record<string, unknown>;
  headers: Readonly<Record<string, string>>;
  timeoutMs: number;
  runtime: Required<OpenAIV1RealtimeCallsRuntimeContext>;
  requestedScopes: readonly string[];
  grantedScopes: readonly string[];
  dryRun: boolean;
  providerCallPlanned: boolean;
  unsafeSideEffects: false;
  providerFieldsOpaque: true;
};

export type OpenAIV1RealtimeCallsProviderCaller = (
  envelope: OpenAIV1RealtimeCallsRequestEnvelope,
) => unknown | Promise<unknown>;

export type OpenAIV1RealtimeCallsInvocationRequest = {
  requestBody?: unknown;
  baseUrl?: string;
  headers?: Readonly<Record<string, string | undefined>>;
  auth?: OpenAIV1RealtimeCallsAuthEnvelope;
  runtime?: OpenAIV1RealtimeCallsRuntimeContext;
  requiredScopes?: readonly string[];
  allowedScopes?: readonly string[];
  timeoutMs?: number;
  contract?: OpenAIV1RealtimeCallsGate;
  governance?: OpenAIV1RealtimeCallsGate;
  dryRun?: boolean;
  mockResponse?: unknown;
  expectResponseObject?: boolean;
  caller?: OpenAIV1RealtimeCallsProviderCaller;
};

export type OpenAIV1RealtimeCallsResponseEnvelope = {
  provider: "openai";
  endpoint: typeof OPENAI_V1_REALTIME_CALLS_ENDPOINT;
  mode: "dry-run" | "mock" | "caller";
  raw: unknown;
  providerFieldsOpaque: true;
};

export type OpenAIV1RealtimeCallsCapabilitySignal = {
  provider: "openai";
  endpoint: typeof OPENAI_V1_REALTIME_CALLS_ENDPOINT;
  rawShape: "realtime-call" | "mock" | "dry-run";
};

export type OpenAIV1RealtimeCallsError = {
  code: OpenAIV1RealtimeCallsErrorCode;
  message: string;
  boundary: OpenAIV1RealtimeCallsBoundary;
  retryable: boolean;
};

export type OpenAIV1RealtimeCallsResult =
  | {
      ok: true;
      request: OpenAIV1RealtimeCallsRequestEnvelope;
      response: OpenAIV1RealtimeCallsResponseEnvelope;
      capability: OpenAIV1RealtimeCallsCapabilitySignal;
      events: readonly string[];
    }
  | {
      ok: false;
      error: OpenAIV1RealtimeCallsError;
      request?: OpenAIV1RealtimeCallsRequestEnvelope;
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

function cleanHeaders(headers: OpenAIV1RealtimeCallsInvocationRequest["headers"]): Readonly<Record<string, string>> {
  return Object.fromEntries(
    Object.entries(headers ?? {})
      .filter((entry): entry is [string, string] => typeof entry[1] === "string" && entry[1].trim().length > 0)
      .map(([key, value]) => [key.trim().toLowerCase(), value.trim()]),
  );
}

function normalizeBaseUrl(baseUrl: string | undefined): string {
  return hasText(baseUrl) ? baseUrl.trim().replace(/\/+$/, "") : DEFAULT_OPENAI_V1_REALTIME_CALLS_BASE_URL;
}

function endpointUrl(baseUrl: string | undefined): string {
  return `${normalizeBaseUrl(baseUrl)}${OPENAI_V1_REALTIME_CALLS_ENDPOINT}`;
}

function failure(
  code: OpenAIV1RealtimeCallsErrorCode,
  message: string,
  boundary: OpenAIV1RealtimeCallsBoundary,
  retryable = false,
  request?: OpenAIV1RealtimeCallsRequestEnvelope,
): OpenAIV1RealtimeCallsResult {
  return {
    ok: false,
    error: { code, message, boundary, retryable },
    request,
    events: ["agentCore.modelAdapter.openai.v1.realtime.calls.rejected"],
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

export function classifyOpenAIV1RealtimeCallsProviderError(error: unknown): OpenAIV1RealtimeCallsErrorCode {
  const status = providerStatus(error);
  const code = providerCode(error);

  if (status === 401 || status === 403) {
    return "PROVIDER_AUTH_FAILED";
  }

  if (status === 429) {
    return "PROVIDER_RATE_LIMITED";
  }

  if (status === 408 || status === 504 || code.includes("timeout") || code.includes("timedout") || code.includes("abort")) {
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

export async function invokeOpenAIV1RealtimeCalls(
  input: OpenAIV1RealtimeCallsInvocationRequest = {},
): Promise<OpenAIV1RealtimeCallsResult> {
  if (input.requestBody === undefined) {
    return failure(
      "MISSING_REQUEST_BODY",
      "OpenAI v1 realtime calls invocation requires a provider request body",
      "input",
    );
  }

  if (!isRecord(input.requestBody)) {
    return failure("INVALID_REQUEST_BODY", "OpenAI v1 realtime calls requestBody must be a JSON object envelope", "input");
  }

  if (input.timeoutMs !== undefined && input.timeoutMs <= 0) {
    return failure("INVALID_TIMEOUT", "OpenAI v1 realtime calls timeoutMs must be greater than zero", "input");
  }

  const runtime = input.runtime;
  if (runtime === undefined || !hasText(runtime.runtimeId)) {
    return failure("MISSING_RUNTIME_ID", "OpenAI v1 realtime calls invocation requires runtime.runtimeId", "input");
  }

  if (input.contract?.accepted === false) {
    return failure(
      "CONTRACT_REJECTED",
      input.contract.reason ?? "OpenAI v1 realtime calls contract rejected the request",
      "contract",
    );
  }

  if (input.governance?.accepted === false) {
    return failure(
      "GOVERNANCE_REJECTED",
      input.governance.reason ?? "OpenAI v1 realtime calls governance rejected the request",
      "governance",
    );
  }

  if (input.auth?.present === false) {
    return failure("AUTH_REJECTED", "OpenAI v1 realtime calls auth envelope is unavailable", "auth");
  }

  const requestedScopes = cleanScopes(input.requiredScopes);
  const allowedScopes = cleanScopes(input.allowedScopes);
  const deniedScopes =
    allowedScopes.length === 0 ? [] : requestedScopes.filter((scope) => !allowedScopes.includes(scope));

  if (deniedScopes.length > 0) {
    return failure(
      "SCOPE_DENIED",
      `OpenAI v1 realtime calls requested scopes outside the allowed boundary: ${deniedScopes.join(", ")}`,
      "scope",
    );
  }

  const request: OpenAIV1RealtimeCallsRequestEnvelope = {
    provider: "openai",
    apiVersion: "v1",
    endpoint: OPENAI_V1_REALTIME_CALLS_ENDPOINT,
    method: "POST",
    url: endpointUrl(input.baseUrl),
    requestBody: input.requestBody,
    headers: cleanHeaders(input.headers),
    timeoutMs: input.timeoutMs ?? 30_000,
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
        endpoint: OPENAI_V1_REALTIME_CALLS_ENDPOINT,
        mode: input.mockResponse === undefined ? "dry-run" : "mock",
        raw: input.mockResponse ?? null,
        providerFieldsOpaque: true,
      },
      capability: {
        provider: "openai",
        endpoint: OPENAI_V1_REALTIME_CALLS_ENDPOINT,
        rawShape: input.mockResponse === undefined ? "dry-run" : "mock",
      },
      events: ["agentCore.modelAdapter.openai.v1.realtime.calls.dryRun"],
    };
  }

  if (input.caller === undefined) {
    return failure(
      "CALLER_REQUIRED",
      "OpenAI v1 realtime calls live invocation requires an injected provider caller",
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
        "OpenAI v1 realtime calls response did not match the expected object envelope",
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
        endpoint: OPENAI_V1_REALTIME_CALLS_ENDPOINT,
        mode: "caller",
        raw,
        providerFieldsOpaque: true,
      },
      capability: {
        provider: "openai",
        endpoint: OPENAI_V1_REALTIME_CALLS_ENDPOINT,
        rawShape: "realtime-call",
      },
      events: ["agentCore.modelAdapter.openai.v1.realtime.calls.called"],
    };
  } catch (error) {
    const code = classifyOpenAIV1RealtimeCallsProviderError(error);
    return failure(
      code,
      `OpenAI v1 realtime calls provider caller failed with ${code}`,
      code === "RESPONSE_FORMAT_DRIFT" ? "response" : "provider",
      code === "PROVIDER_RATE_LIMITED" || code === "PROVIDER_TIMEOUT" || code === "PROVIDER_UNAVAILABLE",
      request,
    );
  }
}
