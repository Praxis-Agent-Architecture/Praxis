/*
 * 文件定位：Agent 模型适配层 / 真实上游调用层 / DeepMind/Gemini 官方调用面。
 * 核心目的：承接 DeepMind/Gemini 上游的 v1beta models predict 真实调用面。
 * 能力要求1：需要把对应 endpoint 的请求参数、响应形态、错误形态和能力信号整理成可适配对象。
 * 能力要求2：鉴权/API 登录后续会接入，但这里要为“上游能力变得实际可用”预留位置。
 * 能力要求3：不把该 provider 的字段形状提升为 Praxis 统一语义，只作为 actualInvocationLayer 的现实入口。
 * 边界：只处理上游实际调用面，不在这里定义 agentCore 使用 AI 的统一方式。
 * 对接：需要被 runtime.modelAdapter 拉起，并和 provider/carrier、PromptPack lowering、能力抽象链路接通。
 * 实现提示：先补稳定类型契约、最小可测行为和清晰错误边界，再接入真实执行逻辑。
 */

export const DEEPMIND_V1BETA_MODELS_PREDICT_ENDPOINT = "/v1beta/models/{model}:predict" as const;
export const DEFAULT_DEEPMIND_V1BETA_MODELS_PREDICT_BASE_URL =
  "https://generativelanguage.googleapis.com" as const;

export type DeepMindV1BetaModelsPredictBoundary =
  | "input"
  | "contract"
  | "governance"
  | "provider"
  | "timeout"
  | "response";

export type DeepMindV1BetaModelsPredictErrorCode =
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

export type DeepMindV1BetaModelsPredictGate = {
  accepted: boolean;
  reason?: string;
};

export type DeepMindV1BetaModelsPredictRuntimeContext = {
  runtimeId?: string;
  invocationId?: string;
  traceId?: string;
};

export type DeepMindV1BetaModelsPredictBody = Readonly<Record<string, unknown>>;

export type DeepMindV1BetaModelsPredictProviderEnvelope = {
  provider: "deepmind";
  apiVersion: "v1beta";
  endpoint: typeof DEEPMIND_V1BETA_MODELS_PREDICT_ENDPOINT;
  operation: "predict";
  method: "POST";
  model: string;
  url: string;
  headers: Readonly<Record<string, string>>;
  body: DeepMindV1BetaModelsPredictBody;
  timeoutMs: number;
  dryRun: boolean;
  providerCallPlanned: boolean;
  runtime: DeepMindV1BetaModelsPredictRuntimeContext;
  providerFieldsOpaque: true;
};

export type DeepMindV1BetaModelsPredictProviderResult = {
  statusCode: number;
  body: unknown;
  headers?: Readonly<Record<string, string>>;
};

export type DeepMindV1BetaModelsPredictTransport = (
  envelope: DeepMindV1BetaModelsPredictProviderEnvelope,
) => Promise<DeepMindV1BetaModelsPredictProviderResult> | DeepMindV1BetaModelsPredictProviderResult;

export type DeepMindV1BetaModelsPredictRequest = {
  baseUrl?: string;
  apiKey?: string;
  model?: string;
  body?: DeepMindV1BetaModelsPredictBody;
  timeoutMs?: number;
  dryRun?: boolean;
  runtime?: DeepMindV1BetaModelsPredictRuntimeContext;
  contract?: DeepMindV1BetaModelsPredictGate;
  governance?: DeepMindV1BetaModelsPredictGate;
  transport?: DeepMindV1BetaModelsPredictTransport;
};

export type DeepMindV1BetaModelsPredictResponseEnvelope = {
  kind: "dry-run" | "provider";
  statusCode?: number;
  body: unknown;
  headers?: Readonly<Record<string, string>>;
  providerFieldsOpaque: true;
};

export type DeepMindV1BetaModelsPredictCapabilitySignal = {
  provider: "deepmind";
  endpoint: typeof DEEPMIND_V1BETA_MODELS_PREDICT_ENDPOINT;
  operation: "predict";
  rawShape: "predictions" | "dry-run";
};

export type DeepMindV1BetaModelsPredictError = {
  code: DeepMindV1BetaModelsPredictErrorCode;
  message: string;
  boundary: DeepMindV1BetaModelsPredictBoundary;
  statusCode?: number;
};

export type DeepMindV1BetaModelsPredictResult =
  | {
      ok: true;
      envelope: DeepMindV1BetaModelsPredictProviderEnvelope;
      response: DeepMindV1BetaModelsPredictResponseEnvelope;
      capability: DeepMindV1BetaModelsPredictCapabilitySignal;
      events: readonly string[];
    }
  | {
      ok: false;
      error: DeepMindV1BetaModelsPredictError;
      envelope?: DeepMindV1BetaModelsPredictProviderEnvelope;
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
    : DEFAULT_DEEPMIND_V1BETA_MODELS_PREDICT_BASE_URL;
  const resource = normalizeModel(model)
    .split("/")
    .map((segment) => encodeURIComponent(segment))
    .join("/");
  return `${base}/v1beta/${resource}:predict`;
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
  code: DeepMindV1BetaModelsPredictErrorCode,
  message: string,
  boundary: DeepMindV1BetaModelsPredictBoundary,
  envelope?: DeepMindV1BetaModelsPredictProviderEnvelope,
  statusCode?: number,
): DeepMindV1BetaModelsPredictResult {
  return {
    ok: false,
    error: { code, message, boundary, statusCode },
    envelope,
    events: ["deepmind.v1beta.models.predict.rejected"],
  };
}

function classifyStatus(statusCode: number): DeepMindV1BetaModelsPredictError | undefined {
  if (statusCode >= 200 && statusCode < 300) {
    return undefined;
  }

  if (statusCode === 401 || statusCode === 403) {
    return {
      code: "PROVIDER_AUTH_FAILED",
      message: "DeepMind v1beta models predict rejected authentication or authorization",
      boundary: "provider",
      statusCode,
    };
  }

  if (statusCode === 408) {
    return {
      code: "PROVIDER_TIMEOUT",
      message: "DeepMind v1beta models predict request timed out upstream",
      boundary: "timeout",
      statusCode,
    };
  }

  if (statusCode === 429) {
    return {
      code: "PROVIDER_RATE_LIMITED",
      message: "DeepMind v1beta models predict request was rate limited",
      boundary: "provider",
      statusCode,
    };
  }

  if (statusCode >= 500) {
    return {
      code: "PROVIDER_UNAVAILABLE",
      message: "DeepMind v1beta models predict endpoint is unavailable",
      boundary: "provider",
      statusCode,
    };
  }

  return {
    code: "PROVIDER_ERROR",
    message: "DeepMind v1beta models predict endpoint returned an unsuccessful status",
    boundary: "provider",
    statusCode,
  };
}

function classifyThrown(error: unknown): DeepMindV1BetaModelsPredictError {
  if (isRecord(error) && (error.name === "AbortError" || error.code === "ETIMEDOUT")) {
    return {
      code: "PROVIDER_TIMEOUT",
      message: "DeepMind v1beta models predict transport timed out",
      boundary: "timeout",
    };
  }

  return {
    code: "PROVIDER_ERROR",
    message: "DeepMind v1beta models predict transport failed before returning a provider response",
    boundary: "provider",
  };
}

function assertPredictBody(body: unknown): DeepMindV1BetaModelsPredictError | undefined {
  if (!isRecord(body) || !Array.isArray(body.predictions)) {
    return {
      code: "RESPONSE_FORMAT_DRIFT",
      message: "DeepMind v1beta models predict response did not contain predictions",
      boundary: "response",
    };
  }

  return undefined;
}

export async function invokeDeepMindV1BetaModelsPredict(
  request?: DeepMindV1BetaModelsPredictRequest,
): Promise<DeepMindV1BetaModelsPredictResult> {
  if (request === undefined) {
    return failure("MISSING_REQUEST", "DeepMind v1beta models predict invocation requires a request object", "input");
  }

  if (!hasText(request.model)) {
    return failure("MISSING_MODEL", "DeepMind v1beta models predict invocation requires model", "input");
  }

  if (!isRecord(request.body)) {
    return failure(
      "MISSING_REQUEST_BODY",
      "DeepMind v1beta models predict invocation requires a provider request body",
      "input",
    );
  }

  if (request.contract?.accepted === false) {
    return failure(
      "CONTRACT_REJECTED",
      request.contract.reason ?? "DeepMind v1beta models predict invocation was rejected by contract checks",
      "contract",
    );
  }

  if (request.governance?.accepted === false) {
    return failure(
      "GOVERNANCE_REJECTED",
      request.governance.reason ?? "DeepMind v1beta models predict invocation was rejected by governance",
      "governance",
    );
  }

  const dryRun = request.dryRun !== false;
  const model = normalizeModel(request.model);
  const envelope: DeepMindV1BetaModelsPredictProviderEnvelope = {
    provider: "deepmind",
    apiVersion: "v1beta",
    endpoint: DEEPMIND_V1BETA_MODELS_PREDICT_ENDPOINT,
    operation: "predict",
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
        endpoint: DEEPMIND_V1BETA_MODELS_PREDICT_ENDPOINT,
        operation: "predict",
        rawShape: "dry-run",
      },
      events: ["deepmind.v1beta.models.predict.planned"],
    };
  }

  if (!hasText(request.apiKey)) {
    return failure("MISSING_AUTH_TOKEN", "DeepMind v1beta models predict live invocation requires apiKey", "input", envelope);
  }

  if (request.transport === undefined) {
    return failure(
      "TRANSPORT_UNAVAILABLE",
      "DeepMind v1beta models predict live invocation requires an injected transport",
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

    const bodyError = assertPredictBody(providerResult.body);
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
        endpoint: DEEPMIND_V1BETA_MODELS_PREDICT_ENDPOINT,
        operation: "predict",
        rawShape: "predictions",
      },
      events: ["deepmind.v1beta.models.predict.invoked"],
    };
  } catch (error) {
    const classified = classifyThrown(error);
    return failure(classified.code, classified.message, classified.boundary, envelope);
  }
}
