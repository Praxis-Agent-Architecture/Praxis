/*
 * 文件定位：Agent 模型适配层 / 真实上游调用层 / DeepMind/Gemini 官方调用面。
 * 核心目的：承接 DeepMind/Gemini 上游的 v1beta models predict Long Running 真实调用面。
 * 能力要求1：需要把对应 endpoint 的请求参数、响应形态、错误形态和能力信号整理成可适配对象。
 * 能力要求2：鉴权/API 登录后续会接入，但这里要为“上游能力变得实际可用”预留位置。
 * 能力要求3：不把该 provider 的字段形状提升为 Praxis 统一语义，只作为 actualInvocationLayer 的现实入口。
 * 边界：只处理上游实际调用面，不在这里定义 agentCore 使用 AI 的统一方式。
 * 对接：需要被 runtime.modelAdapter 拉起，并和 provider/carrier、PromptPack lowering、能力抽象链路接通。
 * 实现提示：先补稳定类型契约、最小可测行为和清晰错误边界，再接入真实执行逻辑。
 */

export const DEEPMIND_V1BETA_MODELS_PREDICT_LONG_RUNNING_ENDPOINT =
  "/v1beta/models/predictLongRunning" as const;
export const DEFAULT_DEEPMIND_V1BETA_PREDICT_LONG_RUNNING_BASE_URL =
  "https://generativelanguage.googleapis.com" as const;

export type DeepMindV1BetaModelsPredictLongRunningBoundary =
  | "input"
  | "contract"
  | "governance"
  | "auth"
  | "scope"
  | "provider"
  | "response";

export type DeepMindV1BetaModelsPredictLongRunningErrorCode =
  | "MISSING_MODEL"
  | "MISSING_BODY"
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

export type DeepMindV1BetaModelsPredictLongRunningGate = {
  accepted: boolean;
  reason?: string;
};

export type DeepMindV1BetaModelsPredictLongRunningRuntimeContext = {
  runtimeId?: string;
  invocationId?: string;
  traceId?: string;
  callerId?: string;
};

export type DeepMindV1BetaModelsPredictLongRunningAuthEnvelope = {
  kind: "api-key" | "oauth" | "none";
  present: boolean;
  redactedToken?: string;
};

export type DeepMindV1BetaModelsPredictLongRunningRequestEnvelope = {
  provider: "deepmind";
  apiVersion: "v1beta";
  endpoint: typeof DEEPMIND_V1BETA_MODELS_PREDICT_LONG_RUNNING_ENDPOINT;
  method: "POST";
  url: string;
  model: string;
  headers: Readonly<Record<string, string>>;
  body: unknown;
  runtime: Required<DeepMindV1BetaModelsPredictLongRunningRuntimeContext>;
  requestedScopes: readonly string[];
  grantedScopes: readonly string[];
  dryRun: boolean;
  providerCallPlanned: boolean;
  unsafeSideEffects: false;
  providerFieldsOpaque: true;
};

export type DeepMindV1BetaModelsPredictLongRunningProviderCaller = (
  envelope: DeepMindV1BetaModelsPredictLongRunningRequestEnvelope,
) => unknown | Promise<unknown>;

export type DeepMindV1BetaModelsPredictLongRunningInvocationRequest = {
  model?: string;
  body?: unknown;
  baseUrl?: string;
  headers?: Readonly<Record<string, string | undefined>>;
  auth?: DeepMindV1BetaModelsPredictLongRunningAuthEnvelope;
  runtime?: DeepMindV1BetaModelsPredictLongRunningRuntimeContext;
  requiredScopes?: readonly string[];
  allowedScopes?: readonly string[];
  contract?: DeepMindV1BetaModelsPredictLongRunningGate;
  governance?: DeepMindV1BetaModelsPredictLongRunningGate;
  dryRun?: boolean;
  mockResponse?: unknown;
  expectResponseObject?: boolean;
  caller?: DeepMindV1BetaModelsPredictLongRunningProviderCaller;
};

export type DeepMindV1BetaModelsPredictLongRunningResponseEnvelope = {
  provider: "deepmind";
  endpoint: typeof DEEPMIND_V1BETA_MODELS_PREDICT_LONG_RUNNING_ENDPOINT;
  mode: "dry-run" | "mock" | "caller";
  raw: unknown;
  providerFieldsOpaque: true;
};

export type DeepMindV1BetaModelsPredictLongRunningCapabilitySignal = {
  provider: "deepmind";
  endpoint: typeof DEEPMIND_V1BETA_MODELS_PREDICT_LONG_RUNNING_ENDPOINT;
  operation: "predict-long-running";
  rawShape: "operation" | "mock" | "dry-run";
};

export type DeepMindV1BetaModelsPredictLongRunningError = {
  code: DeepMindV1BetaModelsPredictLongRunningErrorCode;
  message: string;
  boundary: DeepMindV1BetaModelsPredictLongRunningBoundary;
  retryable: boolean;
};

export type DeepMindV1BetaModelsPredictLongRunningResult =
  | {
      ok: true;
      request: DeepMindV1BetaModelsPredictLongRunningRequestEnvelope;
      response: DeepMindV1BetaModelsPredictLongRunningResponseEnvelope;
      capability: DeepMindV1BetaModelsPredictLongRunningCapabilitySignal;
      events: readonly string[];
    }
  | {
      ok: false;
      error: DeepMindV1BetaModelsPredictLongRunningError;
      request?: DeepMindV1BetaModelsPredictLongRunningRequestEnvelope;
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

function cleanHeaders(
  headers: DeepMindV1BetaModelsPredictLongRunningInvocationRequest["headers"],
): Readonly<Record<string, string>> {
  return Object.fromEntries(
    Object.entries(headers ?? {})
      .filter((entry): entry is [string, string] => typeof entry[1] === "string" && entry[1].trim().length > 0)
      .map(([key, value]) => [key.trim().toLowerCase(), value.trim()]),
  );
}

function normalizeBaseUrl(baseUrl: string | undefined): string {
  return hasText(baseUrl) ? baseUrl.trim().replace(/\/+$/, "") : DEFAULT_DEEPMIND_V1BETA_PREDICT_LONG_RUNNING_BASE_URL;
}

function failure(
  code: DeepMindV1BetaModelsPredictLongRunningErrorCode,
  message: string,
  boundary: DeepMindV1BetaModelsPredictLongRunningBoundary,
  retryable = false,
  request?: DeepMindV1BetaModelsPredictLongRunningRequestEnvelope,
): DeepMindV1BetaModelsPredictLongRunningResult {
  return {
    ok: false,
    error: { code, message, boundary, retryable },
    request,
    events: ["agentCore.modelAdapter.deepmind.v1beta.models.predictLongRunning.rejected"],
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

export function classifyDeepMindV1BetaModelsPredictLongRunningProviderError(
  error: unknown,
): DeepMindV1BetaModelsPredictLongRunningErrorCode {
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

export async function invokeDeepMindV1BetaModelsPredictLongRunning(
  input: DeepMindV1BetaModelsPredictLongRunningInvocationRequest = {},
): Promise<DeepMindV1BetaModelsPredictLongRunningResult> {
  if (!hasText(input.model)) {
    return failure("MISSING_MODEL", "DeepMind v1beta predictLongRunning requires a model identifier", "input");
  }

  if (input.body === undefined) {
    return failure("MISSING_BODY", "DeepMind v1beta predictLongRunning requires an opaque provider body", "input");
  }

  const runtime = input.runtime;
  if (runtime === undefined || !hasText(runtime.runtimeId)) {
    return failure("MISSING_RUNTIME_ID", "DeepMind v1beta predictLongRunning requires runtime.runtimeId", "input");
  }

  if (input.contract?.accepted === false) {
    return failure(
      "CONTRACT_REJECTED",
      input.contract.reason ?? "DeepMind v1beta predictLongRunning contract rejected the request",
      "contract",
    );
  }

  if (input.governance?.accepted === false) {
    return failure(
      "GOVERNANCE_REJECTED",
      input.governance.reason ?? "DeepMind v1beta predictLongRunning governance rejected the request",
      "governance",
    );
  }

  if (input.auth?.present === false) {
    return failure("AUTH_REJECTED", "DeepMind v1beta predictLongRunning auth envelope is unavailable", "auth");
  }

  const requestedScopes = cleanScopes(input.requiredScopes);
  const allowedScopes = cleanScopes(input.allowedScopes);
  const deniedScopes =
    allowedScopes.length === 0 ? [] : requestedScopes.filter((scope) => !allowedScopes.includes(scope));

  if (deniedScopes.length > 0) {
    return failure(
      "SCOPE_DENIED",
      `DeepMind v1beta predictLongRunning requested scopes outside the allowed boundary: ${deniedScopes.join(", ")}`,
      "scope",
    );
  }

  const model = input.model.trim();
  const request: DeepMindV1BetaModelsPredictLongRunningRequestEnvelope = {
    provider: "deepmind",
    apiVersion: "v1beta",
    endpoint: DEEPMIND_V1BETA_MODELS_PREDICT_LONG_RUNNING_ENDPOINT,
    method: "POST",
    url: `${normalizeBaseUrl(input.baseUrl)}${DEEPMIND_V1BETA_MODELS_PREDICT_LONG_RUNNING_ENDPOINT}`,
    model,
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
        provider: "deepmind",
        endpoint: DEEPMIND_V1BETA_MODELS_PREDICT_LONG_RUNNING_ENDPOINT,
        mode: input.mockResponse === undefined ? "dry-run" : "mock",
        raw: input.mockResponse ?? null,
        providerFieldsOpaque: true,
      },
      capability: {
        provider: "deepmind",
        endpoint: DEEPMIND_V1BETA_MODELS_PREDICT_LONG_RUNNING_ENDPOINT,
        operation: "predict-long-running",
        rawShape: input.mockResponse === undefined ? "dry-run" : "mock",
      },
      events: ["agentCore.modelAdapter.deepmind.v1beta.models.predictLongRunning.dryRun"],
    };
  }

  if (input.caller === undefined) {
    return failure(
      "CALLER_REQUIRED",
      "DeepMind v1beta predictLongRunning live invocation requires an injected provider caller",
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
        "DeepMind v1beta predictLongRunning response did not match the expected object envelope",
        "response",
        false,
        request,
      );
    }

    return {
      ok: true,
      request,
      response: {
        provider: "deepmind",
        endpoint: DEEPMIND_V1BETA_MODELS_PREDICT_LONG_RUNNING_ENDPOINT,
        mode: "caller",
        raw,
        providerFieldsOpaque: true,
      },
      capability: {
        provider: "deepmind",
        endpoint: DEEPMIND_V1BETA_MODELS_PREDICT_LONG_RUNNING_ENDPOINT,
        operation: "predict-long-running",
        rawShape: "operation",
      },
      events: ["agentCore.modelAdapter.deepmind.v1beta.models.predictLongRunning.called"],
    };
  } catch (error) {
    const code = classifyDeepMindV1BetaModelsPredictLongRunningProviderError(error);
    return failure(
      code,
      `DeepMind v1beta predictLongRunning provider caller failed with ${code}`,
      code === "RESPONSE_FORMAT_DRIFT" ? "response" : "provider",
      code === "PROVIDER_RATE_LIMITED" || code === "PROVIDER_TIMEOUT" || code === "PROVIDER_UNAVAILABLE",
      request,
    );
  }
}
