/*
 * 文件定位：Agent 模型适配层 / 真实上游调用层 / DeepMind/Gemini 官方调用面。
 * 核心目的：承接 DeepMind/Gemini 上游的 v1beta models embed Content 真实调用面。
 * 能力要求1：需要把对应 endpoint 的请求参数、响应形态、错误形态和能力信号整理成可适配对象。
 * 能力要求2：鉴权/API 登录后续会接入，但这里要为“上游能力变得实际可用”预留位置。
 * 能力要求3：不把该 provider 的字段形状提升为 Praxis 统一语义，只作为 actualInvocationLayer 的现实入口。
 * 边界：只处理上游实际调用面，不在这里定义 agentCore 使用 AI 的统一方式。
 * 对接：需要被 runtime.modelAdapter 拉起，并和 provider/carrier、PromptPack lowering、能力抽象链路接通。
 * 实现提示：先补稳定类型契约、最小可测行为和清晰错误边界，再接入真实执行逻辑。
 */

export const DEEPMIND_V1BETA_MODELS_EMBED_CONTENT_ENDPOINT = "/v1beta/models/{model}:embedContent" as const;
export const DEFAULT_DEEPMIND_V1BETA_MODELS_EMBED_CONTENT_BASE_URL =
  "https://generativelanguage.googleapis.com" as const;

export type DeepMindV1BetaModelsEmbedContentBoundary =
  | "input"
  | "contract"
  | "governance"
  | "provider"
  | "timeout"
  | "response";

export type DeepMindV1BetaModelsEmbedContentErrorCode =
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

export type DeepMindV1BetaModelsEmbedContentGate = {
  accepted: boolean;
  reason?: string;
};

export type DeepMindV1BetaModelsEmbedContentRuntimeContext = {
  runtimeId?: string;
  invocationId?: string;
  traceId?: string;
};

export type DeepMindV1BetaModelsEmbedContentBody = Readonly<Record<string, unknown>>;

export type DeepMindV1BetaModelsEmbedContentProviderEnvelope = {
  provider: "deepmind";
  apiVersion: "v1beta";
  endpoint: typeof DEEPMIND_V1BETA_MODELS_EMBED_CONTENT_ENDPOINT;
  operation: "embed-content";
  method: "POST";
  model: string;
  url: string;
  headers: Readonly<Record<string, string>>;
  body: DeepMindV1BetaModelsEmbedContentBody;
  timeoutMs: number;
  dryRun: boolean;
  providerCallPlanned: boolean;
  runtime: DeepMindV1BetaModelsEmbedContentRuntimeContext;
  providerFieldsOpaque: true;
};

export type DeepMindV1BetaModelsEmbedContentProviderResult = {
  statusCode: number;
  body: unknown;
  headers?: Readonly<Record<string, string>>;
};

export type DeepMindV1BetaModelsEmbedContentTransport = (
  envelope: DeepMindV1BetaModelsEmbedContentProviderEnvelope,
) =>
  | Promise<DeepMindV1BetaModelsEmbedContentProviderResult>
  | DeepMindV1BetaModelsEmbedContentProviderResult;

export type DeepMindV1BetaModelsEmbedContentRequest = {
  baseUrl?: string;
  apiKey?: string;
  model?: string;
  body?: DeepMindV1BetaModelsEmbedContentBody;
  timeoutMs?: number;
  dryRun?: boolean;
  runtime?: DeepMindV1BetaModelsEmbedContentRuntimeContext;
  contract?: DeepMindV1BetaModelsEmbedContentGate;
  governance?: DeepMindV1BetaModelsEmbedContentGate;
  transport?: DeepMindV1BetaModelsEmbedContentTransport;
};

export type DeepMindV1BetaModelsEmbedContentResponseEnvelope = {
  kind: "dry-run" | "provider";
  statusCode?: number;
  body: unknown;
  headers?: Readonly<Record<string, string>>;
  providerFieldsOpaque: true;
};

export type DeepMindV1BetaModelsEmbedContentCapabilitySignal = {
  provider: "deepmind";
  endpoint: typeof DEEPMIND_V1BETA_MODELS_EMBED_CONTENT_ENDPOINT;
  operation: "embed-content";
  rawShape: "embedding" | "dry-run";
};

export type DeepMindV1BetaModelsEmbedContentError = {
  code: DeepMindV1BetaModelsEmbedContentErrorCode;
  message: string;
  boundary: DeepMindV1BetaModelsEmbedContentBoundary;
  statusCode?: number;
};

export type DeepMindV1BetaModelsEmbedContentResult =
  | {
      ok: true;
      envelope: DeepMindV1BetaModelsEmbedContentProviderEnvelope;
      response: DeepMindV1BetaModelsEmbedContentResponseEnvelope;
      capability: DeepMindV1BetaModelsEmbedContentCapabilitySignal;
      events: readonly string[];
    }
  | {
      ok: false;
      error: DeepMindV1BetaModelsEmbedContentError;
      envelope?: DeepMindV1BetaModelsEmbedContentProviderEnvelope;
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
    : DEFAULT_DEEPMIND_V1BETA_MODELS_EMBED_CONTENT_BASE_URL;
  const resource = normalizeModel(model)
    .split("/")
    .map((segment) => encodeURIComponent(segment))
    .join("/");
  return `${base}/v1beta/${resource}:embedContent`;
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
  code: DeepMindV1BetaModelsEmbedContentErrorCode,
  message: string,
  boundary: DeepMindV1BetaModelsEmbedContentBoundary,
  envelope?: DeepMindV1BetaModelsEmbedContentProviderEnvelope,
  statusCode?: number,
): DeepMindV1BetaModelsEmbedContentResult {
  return {
    ok: false,
    error: { code, message, boundary, statusCode },
    envelope,
    events: ["deepmind.v1beta.models.embedContent.rejected"],
  };
}

function classifyStatus(statusCode: number): DeepMindV1BetaModelsEmbedContentError | undefined {
  if (statusCode >= 200 && statusCode < 300) {
    return undefined;
  }

  if (statusCode === 401 || statusCode === 403) {
    return {
      code: "PROVIDER_AUTH_FAILED",
      message: "DeepMind v1beta models embedContent rejected authentication or authorization",
      boundary: "provider",
      statusCode,
    };
  }

  if (statusCode === 408) {
    return {
      code: "PROVIDER_TIMEOUT",
      message: "DeepMind v1beta models embedContent request timed out upstream",
      boundary: "timeout",
      statusCode,
    };
  }

  if (statusCode === 429) {
    return {
      code: "PROVIDER_RATE_LIMITED",
      message: "DeepMind v1beta models embedContent request was rate limited",
      boundary: "provider",
      statusCode,
    };
  }

  if (statusCode >= 500) {
    return {
      code: "PROVIDER_UNAVAILABLE",
      message: "DeepMind v1beta models embedContent endpoint is unavailable",
      boundary: "provider",
      statusCode,
    };
  }

  return {
    code: "PROVIDER_ERROR",
    message: "DeepMind v1beta models embedContent endpoint returned an unsuccessful status",
    boundary: "provider",
    statusCode,
  };
}

function classifyThrown(error: unknown): DeepMindV1BetaModelsEmbedContentError {
  if (isRecord(error) && (error.name === "AbortError" || error.code === "ETIMEDOUT")) {
    return {
      code: "PROVIDER_TIMEOUT",
      message: "DeepMind v1beta models embedContent transport timed out",
      boundary: "timeout",
    };
  }

  return {
    code: "PROVIDER_ERROR",
    message: "DeepMind v1beta models embedContent transport failed before returning a provider response",
    boundary: "provider",
  };
}

function assertEmbedContentBody(body: unknown): DeepMindV1BetaModelsEmbedContentError | undefined {
  const embedding = isRecord(body) ? body.embedding : undefined;
  if (!isRecord(embedding) || !Array.isArray(embedding.values)) {
    return {
      code: "RESPONSE_FORMAT_DRIFT",
      message: "DeepMind v1beta models embedContent response did not contain embedding.values",
      boundary: "response",
    };
  }

  return undefined;
}

export async function invokeDeepMindV1BetaModelsEmbedContent(
  request?: DeepMindV1BetaModelsEmbedContentRequest,
): Promise<DeepMindV1BetaModelsEmbedContentResult> {
  if (request === undefined) {
    return failure("MISSING_REQUEST", "DeepMind v1beta models embedContent invocation requires a request object", "input");
  }

  if (!hasText(request.model)) {
    return failure("MISSING_MODEL", "DeepMind v1beta models embedContent invocation requires model", "input");
  }

  if (!isRecord(request.body)) {
    return failure(
      "MISSING_REQUEST_BODY",
      "DeepMind v1beta models embedContent invocation requires a provider request body",
      "input",
    );
  }

  if (request.contract?.accepted === false) {
    return failure(
      "CONTRACT_REJECTED",
      request.contract.reason ?? "DeepMind v1beta models embedContent invocation was rejected by contract checks",
      "contract",
    );
  }

  if (request.governance?.accepted === false) {
    return failure(
      "GOVERNANCE_REJECTED",
      request.governance.reason ?? "DeepMind v1beta models embedContent invocation was rejected by governance",
      "governance",
    );
  }

  const dryRun = request.dryRun !== false;
  const model = normalizeModel(request.model);
  const envelope: DeepMindV1BetaModelsEmbedContentProviderEnvelope = {
    provider: "deepmind",
    apiVersion: "v1beta",
    endpoint: DEEPMIND_V1BETA_MODELS_EMBED_CONTENT_ENDPOINT,
    operation: "embed-content",
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
        endpoint: DEEPMIND_V1BETA_MODELS_EMBED_CONTENT_ENDPOINT,
        operation: "embed-content",
        rawShape: "dry-run",
      },
      events: ["deepmind.v1beta.models.embedContent.planned"],
    };
  }

  if (!hasText(request.apiKey)) {
    return failure("MISSING_AUTH_TOKEN", "DeepMind v1beta models embedContent live invocation requires apiKey", "input", envelope);
  }

  if (request.transport === undefined) {
    return failure(
      "TRANSPORT_UNAVAILABLE",
      "DeepMind v1beta models embedContent live invocation requires an injected transport",
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

    const bodyError = assertEmbedContentBody(providerResult.body);
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
        endpoint: DEEPMIND_V1BETA_MODELS_EMBED_CONTENT_ENDPOINT,
        operation: "embed-content",
        rawShape: "embedding",
      },
      events: ["deepmind.v1beta.models.embedContent.invoked"],
    };
  } catch (error) {
    const classified = classifyThrown(error);
    return failure(classified.code, classified.message, classified.boundary, envelope);
  }
}
