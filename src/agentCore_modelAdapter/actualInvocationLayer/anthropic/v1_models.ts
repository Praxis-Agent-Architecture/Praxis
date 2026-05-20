/*
 * 文件定位：Agent 模型适配层 / 真实上游调用层 / Anthropic 官方调用面。
 * 核心目的：承接 Anthropic 上游的 v1 models 真实调用面。
 * 能力要求1：需要把对应 endpoint 的请求参数、响应形态、错误形态和能力信号整理成可适配对象。
 * 能力要求2：鉴权/API 登录后续会接入，但这里要为“上游能力变得实际可用”预留位置。
 * 能力要求3：不把该 provider 的字段形状提升为 Praxis 统一语义，只作为 actualInvocationLayer 的现实入口。
 * 边界：只处理上游实际调用面，不在这里定义 agentCore 使用 AI 的统一方式。
 * 对接：需要被 runtime.modelAdapter 拉起，并和 provider/carrier、PromptPack lowering、能力抽象链路接通。
 * 实现提示：先补稳定类型契约、最小可测行为和清晰错误边界，再接入真实执行逻辑。
 */

export const ANTHROPIC_V1_MODELS_ENDPOINT = "/v1/models" as const;
export const DEFAULT_ANTHROPIC_V1_MODELS_BASE_URL = "https://api.anthropic.com" as const;
export const DEFAULT_ANTHROPIC_VERSION = "2023-06-01" as const;

export type AnthropicV1ModelsBoundary =
  | "input"
  | "contract"
  | "governance"
  | "provider"
  | "timeout"
  | "response";

export type AnthropicV1ModelsErrorCode =
  | "MISSING_REQUEST"
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

export type AnthropicV1ModelsGate = {
  accepted: boolean;
  reason?: string;
};

export type AnthropicV1ModelsRuntimeContext = {
  runtimeId?: string;
  invocationId?: string;
  traceId?: string;
};

export type AnthropicV1ModelsQuery = {
  before_id?: string;
  after_id?: string;
  limit?: number;
};

export type AnthropicV1ModelsProviderEnvelope = {
  provider: "anthropic";
  endpoint: typeof ANTHROPIC_V1_MODELS_ENDPOINT;
  method: "GET";
  url: string;
  headers: Readonly<Record<string, string>>;
  query: Readonly<AnthropicV1ModelsQuery>;
  timeoutMs: number;
  dryRun: boolean;
  providerCallPlanned: boolean;
  runtime: AnthropicV1ModelsRuntimeContext;
};

export type AnthropicV1ModelsProviderResult = {
  statusCode: number;
  body: unknown;
  headers?: Readonly<Record<string, string>>;
};

export type AnthropicV1ModelsTransport = (
  envelope: AnthropicV1ModelsProviderEnvelope,
) => Promise<AnthropicV1ModelsProviderResult> | AnthropicV1ModelsProviderResult;

export type AnthropicV1ModelsRequest = {
  baseUrl?: string;
  apiKey?: string;
  anthropicVersion?: string;
  query?: AnthropicV1ModelsQuery;
  timeoutMs?: number;
  dryRun?: boolean;
  runtime?: AnthropicV1ModelsRuntimeContext;
  contract?: AnthropicV1ModelsGate;
  governance?: AnthropicV1ModelsGate;
  transport?: AnthropicV1ModelsTransport;
};

export type AnthropicV1ModelsResponseEnvelope = {
  kind: "dry-run" | "provider";
  statusCode?: number;
  body: unknown;
  headers?: Readonly<Record<string, string>>;
};

export type AnthropicV1ModelsCapabilitySignal = {
  provider: "anthropic";
  endpoint: typeof ANTHROPIC_V1_MODELS_ENDPOINT;
  operation: "list-models";
  rawShape: "models-list" | "dry-run";
};

export type AnthropicV1ModelsError = {
  code: AnthropicV1ModelsErrorCode;
  message: string;
  boundary: AnthropicV1ModelsBoundary;
  statusCode?: number;
};

export type AnthropicV1ModelsResult =
  | {
      ok: true;
      envelope: AnthropicV1ModelsProviderEnvelope;
      response: AnthropicV1ModelsResponseEnvelope;
      capability: AnthropicV1ModelsCapabilitySignal;
      events: readonly string[];
    }
  | {
      ok: false;
      error: AnthropicV1ModelsError;
      envelope?: AnthropicV1ModelsProviderEnvelope;
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
  };

  if (hasText(apiKey)) {
    result["x-api-key"] = apiKey.trim();
  }

  return result;
}

function buildUrl(baseUrl: string | undefined): string {
  const base = hasText(baseUrl) ? baseUrl.trim().replace(/\/+$/, "") : DEFAULT_ANTHROPIC_V1_MODELS_BASE_URL;
  return `${base}${ANTHROPIC_V1_MODELS_ENDPOINT}`;
}

function failure(
  code: AnthropicV1ModelsErrorCode,
  message: string,
  boundary: AnthropicV1ModelsBoundary,
  envelope?: AnthropicV1ModelsProviderEnvelope,
  statusCode?: number,
): AnthropicV1ModelsResult {
  return {
    ok: false,
    error: { code, message, boundary, statusCode },
    envelope,
    events: ["anthropic.v1.models.rejected"],
  };
}

function classifyStatus(statusCode: number): AnthropicV1ModelsError | undefined {
  if (statusCode >= 200 && statusCode < 300) {
    return undefined;
  }

  if (statusCode === 401 || statusCode === 403) {
    return {
      code: "PROVIDER_AUTH_FAILED",
      message: "Anthropic v1 models rejected authentication or authorization",
      boundary: "provider",
      statusCode,
    };
  }

  if (statusCode === 408) {
    return {
      code: "PROVIDER_TIMEOUT",
      message: "Anthropic v1 models request timed out upstream",
      boundary: "timeout",
      statusCode,
    };
  }

  if (statusCode === 429) {
    return {
      code: "PROVIDER_RATE_LIMITED",
      message: "Anthropic v1 models request was rate limited",
      boundary: "provider",
      statusCode,
    };
  }

  if (statusCode >= 500) {
    return {
      code: "PROVIDER_UNAVAILABLE",
      message: "Anthropic v1 models endpoint is unavailable",
      boundary: "provider",
      statusCode,
    };
  }

  return {
    code: "PROVIDER_ERROR",
    message: "Anthropic v1 models endpoint returned an unsuccessful status",
    boundary: "provider",
    statusCode,
  };
}

function classifyThrown(error: unknown): AnthropicV1ModelsError {
  if (isRecord(error) && (error.name === "AbortError" || error.code === "ETIMEDOUT")) {
    return {
      code: "PROVIDER_TIMEOUT",
      message: "Anthropic v1 models transport timed out",
      boundary: "timeout",
    };
  }

  return {
    code: "PROVIDER_ERROR",
    message: "Anthropic v1 models transport failed before returning a provider response",
    boundary: "provider",
  };
}

function assertModelsBody(body: unknown): AnthropicV1ModelsError | undefined {
  if (!isRecord(body) || !Array.isArray(body.data)) {
    return {
      code: "RESPONSE_FORMAT_DRIFT",
      message: "Anthropic v1 models response did not contain a provider data array",
      boundary: "response",
    };
  }

  return undefined;
}

export async function invokeAnthropicV1Models(
  request?: AnthropicV1ModelsRequest,
): Promise<AnthropicV1ModelsResult> {
  if (request === undefined) {
    return failure("MISSING_REQUEST", "Anthropic v1 models invocation requires a request object", "input");
  }

  if (request.contract?.accepted === false) {
    return failure(
      "CONTRACT_REJECTED",
      request.contract.reason ?? "Anthropic v1 models invocation was rejected by contract checks",
      "contract",
    );
  }

  if (request.governance?.accepted === false) {
    return failure(
      "GOVERNANCE_REJECTED",
      request.governance.reason ?? "Anthropic v1 models invocation was rejected by governance",
      "governance",
    );
  }

  const dryRun = request.dryRun !== false;
  const envelope: AnthropicV1ModelsProviderEnvelope = {
    provider: "anthropic",
    endpoint: ANTHROPIC_V1_MODELS_ENDPOINT,
    method: "GET",
    url: buildUrl(request.baseUrl),
    headers: headers(request.apiKey, request.anthropicVersion),
    query: request.query ?? {},
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
        endpoint: ANTHROPIC_V1_MODELS_ENDPOINT,
        operation: "list-models",
        rawShape: "dry-run",
      },
      events: ["anthropic.v1.models.planned"],
    };
  }

  if (!hasText(request.apiKey)) {
    return failure("MISSING_AUTH_TOKEN", "Anthropic v1 models live invocation requires apiKey", "input", envelope);
  }

  if (request.transport === undefined) {
    return failure(
      "TRANSPORT_UNAVAILABLE",
      "Anthropic v1 models live invocation requires an injected transport",
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

    const bodyError = assertModelsBody(providerResult.body);
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
        endpoint: ANTHROPIC_V1_MODELS_ENDPOINT,
        operation: "list-models",
        rawShape: "models-list",
      },
      events: ["anthropic.v1.models.invoked"],
    };
  } catch (error) {
    const classified = classifyThrown(error);
    return failure(classified.code, classified.message, classified.boundary, envelope);
  }
}
