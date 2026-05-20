/*
 * 文件定位：Agent 模型适配层 / 真实上游调用层 / Anthropic 官方调用面。
 * 核心目的：承接 Anthropic 上游的 v1 sessions 真实调用面。
 * 能力要求1：需要把对应 endpoint 的请求参数、响应形态、错误形态和能力信号整理成可适配对象。
 * 能力要求2：鉴权/API 登录后续会接入，但这里要为“上游能力变得实际可用”预留位置。
 * 能力要求3：不把该 provider 的字段形状提升为 Praxis 统一语义，只作为 actualInvocationLayer 的现实入口。
 * 边界：只处理上游实际调用面，不在这里定义 agentCore 使用 AI 的统一方式。
 * 对接：需要被 runtime.modelAdapter 拉起，并和 provider/carrier、PromptPack lowering、能力抽象链路接通。
 * 实现提示：先补稳定类型契约、最小可测行为和清晰错误边界，再接入真实执行逻辑。
 */

export const ANTHROPIC_V1_SESSIONS_ENDPOINT = "/v1/sessions" as const;
export const DEFAULT_ANTHROPIC_V1_SESSIONS_BASE_URL = "https://api.anthropic.com" as const;
export const DEFAULT_ANTHROPIC_VERSION = "2023-06-01" as const;

export type AnthropicV1SessionsOperation = "create" | "list" | "retrieve" | "delete";
export type AnthropicV1SessionsMethod = "GET" | "POST" | "DELETE";

export type AnthropicV1SessionsBoundary =
  | "input"
  | "contract"
  | "governance"
  | "provider"
  | "timeout"
  | "response";

export type AnthropicV1SessionsErrorCode =
  | "MISSING_REQUEST"
  | "MISSING_OPERATION"
  | "MISSING_SESSION_ID"
  | "MISSING_REQUEST_BODY"
  | "MISSING_AUTH_TOKEN"
  | "CONTRACT_REJECTED"
  | "GOVERNANCE_REJECTED"
  | "TRANSPORT_UNAVAILABLE"
  | "PROVIDER_AUTH_FAILED"
  | "PROVIDER_RATE_LIMITED"
  | "PROVIDER_TIMEOUT"
  | "PROVIDER_UNAVAILABLE"
  | "PROVIDER_ERROR"
  | "RESPONSE_FORMAT_DRIFT";

export type AnthropicV1SessionsGate = {
  accepted: boolean;
  reason?: string;
};

export type AnthropicV1SessionsRuntimeContext = {
  runtimeId?: string;
  invocationId?: string;
  traceId?: string;
};

export type AnthropicV1SessionsBody = Readonly<Record<string, unknown>>;

export type AnthropicV1SessionsProviderEnvelope = {
  provider: "anthropic";
  endpoint: typeof ANTHROPIC_V1_SESSIONS_ENDPOINT;
  operation: AnthropicV1SessionsOperation;
  method: AnthropicV1SessionsMethod;
  url: string;
  headers: Readonly<Record<string, string>>;
  body?: AnthropicV1SessionsBody;
  timeoutMs: number;
  dryRun: boolean;
  providerCallPlanned: boolean;
  runtime: AnthropicV1SessionsRuntimeContext;
};

export type AnthropicV1SessionsProviderResult = {
  statusCode: number;
  body: unknown;
  headers?: Readonly<Record<string, string>>;
};

export type AnthropicV1SessionsTransport = (
  envelope: AnthropicV1SessionsProviderEnvelope,
) => Promise<AnthropicV1SessionsProviderResult> | AnthropicV1SessionsProviderResult;

export type AnthropicV1SessionsRequest = {
  operation?: AnthropicV1SessionsOperation;
  sessionId?: string;
  baseUrl?: string;
  apiKey?: string;
  anthropicVersion?: string;
  body?: AnthropicV1SessionsBody;
  timeoutMs?: number;
  dryRun?: boolean;
  runtime?: AnthropicV1SessionsRuntimeContext;
  contract?: AnthropicV1SessionsGate;
  governance?: AnthropicV1SessionsGate;
  transport?: AnthropicV1SessionsTransport;
};

export type AnthropicV1SessionsResponseEnvelope = {
  kind: "dry-run" | "provider";
  statusCode?: number;
  body: unknown;
  headers?: Readonly<Record<string, string>>;
};

export type AnthropicV1SessionsCapabilitySignal = {
  provider: "anthropic";
  endpoint: typeof ANTHROPIC_V1_SESSIONS_ENDPOINT;
  operation: AnthropicV1SessionsOperation;
  rawShape: "session-object" | "dry-run";
};

export type AnthropicV1SessionsError = {
  code: AnthropicV1SessionsErrorCode;
  message: string;
  boundary: AnthropicV1SessionsBoundary;
  statusCode?: number;
};

export type AnthropicV1SessionsResult =
  | {
      ok: true;
      envelope: AnthropicV1SessionsProviderEnvelope;
      response: AnthropicV1SessionsResponseEnvelope;
      capability: AnthropicV1SessionsCapabilitySignal;
      events: readonly string[];
    }
  | {
      ok: false;
      error: AnthropicV1SessionsError;
      envelope?: AnthropicV1SessionsProviderEnvelope;
      events: readonly string[];
    };

function hasText(value: string | undefined): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function headers(apiKey: string | undefined, anthropicVersion: string | undefined): Record<string, string> {
  const result: Record<string, string> = {
    "anthropic-version": hasText(anthropicVersion) ? anthropicVersion.trim() : DEFAULT_ANTHROPIC_VERSION,
    "content-type": "application/json",
  };

  if (hasText(apiKey)) {
    result["x-api-key"] = apiKey.trim();
  }

  return result;
}

function endpointPath(operation: AnthropicV1SessionsOperation, sessionId: string | undefined): string {
  if (operation === "retrieve" || operation === "delete") {
    return `${ANTHROPIC_V1_SESSIONS_ENDPOINT}/${sessionId}`;
  }

  return ANTHROPIC_V1_SESSIONS_ENDPOINT;
}

function methodFor(operation: AnthropicV1SessionsOperation): AnthropicV1SessionsMethod {
  if (operation === "create") {
    return "POST";
  }

  if (operation === "delete") {
    return "DELETE";
  }

  return "GET";
}

function buildUrl(baseUrl: string | undefined, operation: AnthropicV1SessionsOperation, sessionId?: string): string {
  const base = hasText(baseUrl) ? baseUrl.trim().replace(/\/+$/, "") : DEFAULT_ANTHROPIC_V1_SESSIONS_BASE_URL;
  return `${base}${endpointPath(operation, sessionId)}`;
}

function failure(
  code: AnthropicV1SessionsErrorCode,
  message: string,
  boundary: AnthropicV1SessionsBoundary,
  envelope?: AnthropicV1SessionsProviderEnvelope,
  statusCode?: number,
): AnthropicV1SessionsResult {
  return {
    ok: false,
    error: { code, message, boundary, statusCode },
    envelope,
    events: ["anthropic.v1.sessions.rejected"],
  };
}

function classifyStatus(statusCode: number): AnthropicV1SessionsError | undefined {
  if (statusCode >= 200 && statusCode < 300) {
    return undefined;
  }

  if (statusCode === 401 || statusCode === 403) {
    return {
      code: "PROVIDER_AUTH_FAILED",
      message: "Anthropic v1 sessions rejected authentication or authorization",
      boundary: "provider",
      statusCode,
    };
  }

  if (statusCode === 408) {
    return {
      code: "PROVIDER_TIMEOUT",
      message: "Anthropic v1 sessions request timed out upstream",
      boundary: "timeout",
      statusCode,
    };
  }

  if (statusCode === 429) {
    return {
      code: "PROVIDER_RATE_LIMITED",
      message: "Anthropic v1 sessions request was rate limited",
      boundary: "provider",
      statusCode,
    };
  }

  if (statusCode >= 500) {
    return {
      code: "PROVIDER_UNAVAILABLE",
      message: "Anthropic v1 sessions endpoint is unavailable",
      boundary: "provider",
      statusCode,
    };
  }

  return {
    code: "PROVIDER_ERROR",
    message: "Anthropic v1 sessions endpoint returned an unsuccessful status",
    boundary: "provider",
    statusCode,
  };
}

function classifyThrown(error: unknown): AnthropicV1SessionsError {
  if (isRecord(error) && (error.name === "AbortError" || error.code === "ETIMEDOUT")) {
    return {
      code: "PROVIDER_TIMEOUT",
      message: "Anthropic v1 sessions transport timed out",
      boundary: "timeout",
    };
  }

  return {
    code: "PROVIDER_ERROR",
    message: "Anthropic v1 sessions transport failed before returning a provider response",
    boundary: "provider",
  };
}

function assertSessionBody(body: unknown): AnthropicV1SessionsError | undefined {
  if (!isRecord(body)) {
    return {
      code: "RESPONSE_FORMAT_DRIFT",
      message: "Anthropic v1 sessions response did not contain a provider object",
      boundary: "response",
    };
  }

  return undefined;
}

export async function invokeAnthropicV1Sessions(
  request?: AnthropicV1SessionsRequest,
): Promise<AnthropicV1SessionsResult> {
  if (request === undefined) {
    return failure("MISSING_REQUEST", "Anthropic v1 sessions invocation requires a request object", "input");
  }

  if (request.operation === undefined) {
    return failure("MISSING_OPERATION", "Anthropic v1 sessions invocation requires an operation", "input");
  }

  if ((request.operation === "retrieve" || request.operation === "delete") && !hasText(request.sessionId)) {
    return failure(
      "MISSING_SESSION_ID",
      "Anthropic v1 sessions invocation requires sessionId for the selected operation",
      "input",
    );
  }

  if (request.operation === "create" && !isRecord(request.body)) {
    return failure(
      "MISSING_REQUEST_BODY",
      "Anthropic v1 sessions create invocation requires a provider request body",
      "input",
    );
  }

  if (request.contract?.accepted === false) {
    return failure(
      "CONTRACT_REJECTED",
      request.contract.reason ?? "Anthropic v1 sessions invocation was rejected by contract checks",
      "contract",
    );
  }

  if (request.governance?.accepted === false) {
    return failure(
      "GOVERNANCE_REJECTED",
      request.governance.reason ?? "Anthropic v1 sessions invocation was rejected by governance",
      "governance",
    );
  }

  const dryRun = request.dryRun !== false;
  const sessionId = request.sessionId?.trim();
  const envelope: AnthropicV1SessionsProviderEnvelope = {
    provider: "anthropic",
    endpoint: ANTHROPIC_V1_SESSIONS_ENDPOINT,
    operation: request.operation,
    method: methodFor(request.operation),
    url: buildUrl(request.baseUrl, request.operation, sessionId),
    headers: headers(request.apiKey, request.anthropicVersion),
    body: request.body,
    timeoutMs: request.timeoutMs ?? 30_000,
    dryRun,
    providerCallPlanned: !dryRun,
    runtime: request.runtime ?? {},
  };

  if (dryRun) {
    return {
      ok: true,
      envelope,
      response: { kind: "dry-run", body: null },
      capability: {
        provider: "anthropic",
        endpoint: ANTHROPIC_V1_SESSIONS_ENDPOINT,
        operation: request.operation,
        rawShape: "dry-run",
      },
      events: ["anthropic.v1.sessions.planned"],
    };
  }

  if (!hasText(request.apiKey)) {
    return failure("MISSING_AUTH_TOKEN", "Anthropic v1 sessions live invocation requires apiKey", "input", envelope);
  }

  if (request.transport === undefined) {
    return failure(
      "TRANSPORT_UNAVAILABLE",
      "Anthropic v1 sessions live invocation requires an injected transport",
      "provider",
      envelope,
    );
  }

  try {
    const providerResult = await request.transport(envelope);
    const statusError = classifyStatus(providerResult.statusCode);
    if (statusError !== undefined) {
      return failure(statusError.code, statusError.message, statusError.boundary, envelope, statusError.statusCode);
    }

    const bodyError = assertSessionBody(providerResult.body);
    if (bodyError !== undefined) {
      return failure(bodyError.code, bodyError.message, bodyError.boundary, envelope);
    }

    return {
      ok: true,
      envelope,
      response: {
        kind: "provider",
        statusCode: providerResult.statusCode,
        body: providerResult.body,
        headers: providerResult.headers,
      },
      capability: {
        provider: "anthropic",
        endpoint: ANTHROPIC_V1_SESSIONS_ENDPOINT,
        operation: request.operation,
        rawShape: "session-object",
      },
      events: ["anthropic.v1.sessions.invoked"],
    };
  } catch (error) {
    const classified = classifyThrown(error);
    return failure(classified.code, classified.message, classified.boundary, envelope);
  }
}
