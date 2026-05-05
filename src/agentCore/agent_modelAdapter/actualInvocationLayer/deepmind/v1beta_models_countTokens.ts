/*
 * 文件定位：Agent 模型适配层 / 真实上游调用层 / DeepMind/Gemini 官方调用面。
 * 核心目的：承接 DeepMind/Gemini 上游的 v1beta models count Tokens 真实调用面。
 * 能力要求1：需要把对应 endpoint 的请求参数、响应形态、错误形态和能力信号整理成可适配对象。
 * 能力要求2：鉴权/API 登录后续会接入，但这里要为“上游能力变得实际可用”预留位置。
 * 能力要求3：不把该 provider 的字段形状提升为 Praxis 统一语义，只作为 actualInvocationLayer 的现实入口。
 * 边界：只处理上游实际调用面，不在这里定义 agentCore 使用 AI 的统一方式。
 * 对接：需要被 runtime.modelAdapter 拉起，并和 provider/carrier、PromptPack lowering、能力抽象链路接通。
 * 实现提示：先补稳定类型契约、最小可测行为和清晰错误边界，再接入真实执行逻辑。
 */

export const DEEPMIND_V1BETA_MODELS_COUNT_TOKENS_ENDPOINT = "/v1beta/models/{model}:countTokens" as const;
export const DEFAULT_DEEPMIND_V1BETA_MODELS_COUNT_TOKENS_BASE_URL =
  "https://generativelanguage.googleapis.com" as const;

export type DeepMindV1BetaModelsCountTokensBoundary =
  | "input"
  | "contract"
  | "governance"
  | "provider"
  | "timeout"
  | "response";

export type DeepMindV1BetaModelsCountTokensErrorCode =
  | "MISSING_REQUEST"
  | "MISSING_MODEL"
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

export type DeepMindV1BetaModelsCountTokensGate = {
  accepted: boolean;
  reason?: string;
};

export type DeepMindV1BetaModelsCountTokensRuntimeContext = {
  runtimeId?: string;
  invocationId?: string;
  traceId?: string;
};

export type DeepMindV1BetaModelsCountTokensBody = Readonly<Record<string, unknown>>;

export type DeepMindV1BetaModelsCountTokensProviderEnvelope = {
  provider: "deepmind";
  apiVersion: "v1beta";
  endpoint: typeof DEEPMIND_V1BETA_MODELS_COUNT_TOKENS_ENDPOINT;
  operation: "count-tokens";
  method: "POST";
  model: string;
  url: string;
  headers: Readonly<Record<string, string>>;
  body: DeepMindV1BetaModelsCountTokensBody;
  timeoutMs: number;
  dryRun: boolean;
  providerCallPlanned: boolean;
  runtime: DeepMindV1BetaModelsCountTokensRuntimeContext;
  providerFieldsOpaque: true;
};

export type DeepMindV1BetaModelsCountTokensProviderResult = {
  statusCode: number;
  body: unknown;
  headers?: Readonly<Record<string, string>>;
};

export type DeepMindV1BetaModelsCountTokensTransport = (
  envelope: DeepMindV1BetaModelsCountTokensProviderEnvelope,
) =>
  | Promise<DeepMindV1BetaModelsCountTokensProviderResult>
  | DeepMindV1BetaModelsCountTokensProviderResult;

export type DeepMindV1BetaModelsCountTokensRequest = {
  baseUrl?: string;
  apiKey?: string;
  model?: string;
  body?: DeepMindV1BetaModelsCountTokensBody;
  timeoutMs?: number;
  dryRun?: boolean;
  runtime?: DeepMindV1BetaModelsCountTokensRuntimeContext;
  contract?: DeepMindV1BetaModelsCountTokensGate;
  governance?: DeepMindV1BetaModelsCountTokensGate;
  transport?: DeepMindV1BetaModelsCountTokensTransport;
};

export type DeepMindV1BetaModelsCountTokensResponseEnvelope = {
  kind: "dry-run" | "provider";
  statusCode?: number;
  body: unknown;
  headers?: Readonly<Record<string, string>>;
  providerFieldsOpaque: true;
};

export type DeepMindV1BetaModelsCountTokensCapabilitySignal = {
  provider: "deepmind";
  endpoint: typeof DEEPMIND_V1BETA_MODELS_COUNT_TOKENS_ENDPOINT;
  operation: "count-tokens";
  rawShape: "token-count" | "dry-run";
};

export type DeepMindV1BetaModelsCountTokensError = {
  code: DeepMindV1BetaModelsCountTokensErrorCode;
  message: string;
  boundary: DeepMindV1BetaModelsCountTokensBoundary;
  statusCode?: number;
};

export type DeepMindV1BetaModelsCountTokensResult =
  | {
      ok: true;
      envelope: DeepMindV1BetaModelsCountTokensProviderEnvelope;
      response: DeepMindV1BetaModelsCountTokensResponseEnvelope;
      capability: DeepMindV1BetaModelsCountTokensCapabilitySignal;
      events: readonly string[];
    }
  | {
      ok: false;
      error: DeepMindV1BetaModelsCountTokensError;
      envelope?: DeepMindV1BetaModelsCountTokensProviderEnvelope;
      events: readonly string[];
    };

function hasText(value: string | undefined): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function normalizeModel(model: string): string {
  const trimmed = model.trim().replace(/^\/+/, "");
  return trimmed.startsWith("models/") ? trimmed : `models/${trimmed}`;
}

function buildUrl(baseUrl: string | undefined, model: string): string {
  const base = hasText(baseUrl)
    ? baseUrl.trim().replace(/\/+$/, "")
    : DEFAULT_DEEPMIND_V1BETA_MODELS_COUNT_TOKENS_BASE_URL;
  const resource = normalizeModel(model)
    .split("/")
    .map((segment) => encodeURIComponent(segment))
    .join("/");
  return `${base}/v1beta/${resource}:countTokens`;
}

function headers(apiKey: string | undefined): Record<string, string> {
  const result: Record<string, string> = {
    "content-type": "application/json",
  };

  if (hasText(apiKey)) {
    result["x-goog-api-key"] = apiKey.trim();
  }

  return result;
}

function failure(
  code: DeepMindV1BetaModelsCountTokensErrorCode,
  message: string,
  boundary: DeepMindV1BetaModelsCountTokensBoundary,
  envelope?: DeepMindV1BetaModelsCountTokensProviderEnvelope,
  statusCode?: number,
): DeepMindV1BetaModelsCountTokensResult {
  return {
    ok: false,
    error: { code, message, boundary, statusCode },
    envelope,
    events: ["deepmind.v1beta.models.countTokens.rejected"],
  };
}

function classifyStatus(statusCode: number): DeepMindV1BetaModelsCountTokensError | undefined {
  if (statusCode >= 200 && statusCode < 300) {
    return undefined;
  }

  if (statusCode === 401 || statusCode === 403) {
    return {
      code: "PROVIDER_AUTH_FAILED",
      message: "DeepMind v1beta models countTokens rejected authentication or authorization",
      boundary: "provider",
      statusCode,
    };
  }

  if (statusCode === 408) {
    return {
      code: "PROVIDER_TIMEOUT",
      message: "DeepMind v1beta models countTokens request timed out upstream",
      boundary: "timeout",
      statusCode,
    };
  }

  if (statusCode === 429) {
    return {
      code: "PROVIDER_RATE_LIMITED",
      message: "DeepMind v1beta models countTokens request was rate limited",
      boundary: "provider",
      statusCode,
    };
  }

  if (statusCode >= 500) {
    return {
      code: "PROVIDER_UNAVAILABLE",
      message: "DeepMind v1beta models countTokens endpoint is unavailable",
      boundary: "provider",
      statusCode,
    };
  }

  return {
    code: "PROVIDER_ERROR",
    message: "DeepMind v1beta models countTokens endpoint returned an unsuccessful status",
    boundary: "provider",
    statusCode,
  };
}

function classifyThrown(error: unknown): DeepMindV1BetaModelsCountTokensError {
  if (isRecord(error) && (error.name === "AbortError" || error.code === "ETIMEDOUT")) {
    return {
      code: "PROVIDER_TIMEOUT",
      message: "DeepMind v1beta models countTokens transport timed out",
      boundary: "timeout",
    };
  }

  return {
    code: "PROVIDER_ERROR",
    message: "DeepMind v1beta models countTokens transport failed before returning a provider response",
    boundary: "provider",
  };
}

function assertCountTokensBody(body: unknown): DeepMindV1BetaModelsCountTokensError | undefined {
  if (!isRecord(body) || typeof body.totalTokens !== "number") {
    return {
      code: "RESPONSE_FORMAT_DRIFT",
      message: "DeepMind v1beta models countTokens response did not contain totalTokens",
      boundary: "response",
    };
  }

  return undefined;
}

export async function invokeDeepMindV1BetaModelsCountTokens(
  request?: DeepMindV1BetaModelsCountTokensRequest,
): Promise<DeepMindV1BetaModelsCountTokensResult> {
  if (request === undefined) {
    return failure("MISSING_REQUEST", "DeepMind v1beta models countTokens invocation requires a request object", "input");
  }

  if (!hasText(request.model)) {
    return failure("MISSING_MODEL", "DeepMind v1beta models countTokens invocation requires model", "input");
  }

  if (!isRecord(request.body)) {
    return failure(
      "MISSING_REQUEST_BODY",
      "DeepMind v1beta models countTokens invocation requires a provider request body",
      "input",
    );
  }

  if (request.contract?.accepted === false) {
    return failure(
      "CONTRACT_REJECTED",
      request.contract.reason ?? "DeepMind v1beta models countTokens invocation was rejected by contract checks",
      "contract",
    );
  }

  if (request.governance?.accepted === false) {
    return failure(
      "GOVERNANCE_REJECTED",
      request.governance.reason ?? "DeepMind v1beta models countTokens invocation was rejected by governance",
      "governance",
    );
  }

  const dryRun = request.dryRun !== false;
  const model = normalizeModel(request.model);
  const envelope: DeepMindV1BetaModelsCountTokensProviderEnvelope = {
    provider: "deepmind",
    apiVersion: "v1beta",
    endpoint: DEEPMIND_V1BETA_MODELS_COUNT_TOKENS_ENDPOINT,
    operation: "count-tokens",
    method: "POST",
    model,
    url: buildUrl(request.baseUrl, model),
    headers: headers(request.apiKey),
    body: request.body,
    timeoutMs: request.timeoutMs ?? 30_000,
    dryRun,
    providerCallPlanned: !dryRun,
    runtime: request.runtime ?? {},
    providerFieldsOpaque: true,
  };

  if (dryRun) {
    return {
      ok: true,
      envelope,
      response: { kind: "dry-run", body: null, providerFieldsOpaque: true },
      capability: {
        provider: "deepmind",
        endpoint: DEEPMIND_V1BETA_MODELS_COUNT_TOKENS_ENDPOINT,
        operation: "count-tokens",
        rawShape: "dry-run",
      },
      events: ["deepmind.v1beta.models.countTokens.planned"],
    };
  }

  if (!hasText(request.apiKey)) {
    return failure("MISSING_AUTH_TOKEN", "DeepMind v1beta models countTokens live invocation requires apiKey", "input", envelope);
  }

  if (request.transport === undefined) {
    return failure(
      "TRANSPORT_UNAVAILABLE",
      "DeepMind v1beta models countTokens live invocation requires an injected transport",
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

    const bodyError = assertCountTokensBody(providerResult.body);
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
        providerFieldsOpaque: true,
      },
      capability: {
        provider: "deepmind",
        endpoint: DEEPMIND_V1BETA_MODELS_COUNT_TOKENS_ENDPOINT,
        operation: "count-tokens",
        rawShape: "token-count",
      },
      events: ["deepmind.v1beta.models.countTokens.invoked"],
    };
  } catch (error) {
    const classified = classifyThrown(error);
    return failure(classified.code, classified.message, classified.boundary, envelope);
  }
}
