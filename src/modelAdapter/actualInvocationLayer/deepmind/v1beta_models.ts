/*
 * 文件定位：Agent 模型适配层 / 真实上游调用层 / DeepMind/Gemini 官方调用面。
 * 核心目的：承接 DeepMind/Gemini 上游的 v1beta models 真实调用面。
 * 能力要求1：需要把对应 endpoint 的请求参数、响应形态、错误形态和能力信号整理成可适配对象。
 * 能力要求2：鉴权/API 登录后续会接入，但这里要为“上游能力变得实际可用”预留位置。
 * 能力要求3：不把该 provider 的字段形状提升为 Praxis 统一语义，只作为 actualInvocationLayer 的现实入口。
 * 边界：只处理上游实际调用面，不在这里定义 agentCore 使用 AI 的统一方式。
 * 对接：需要被 runtime.modelAdapter 拉起，并和 provider/carrier、PromptPack lowering、能力抽象链路接通。
 * 实现提示：先补稳定类型契约、最小可测行为和清晰错误边界，再接入真实执行逻辑。
 */

export const DEEPMIND_V1BETA_MODELS_ENDPOINT = "/v1beta/models" as const;

export type DeepMindV1BetaModelsBoundary =
  | "input"
  | "contract"
  | "governance"
  | "auth"
  | "scope"
  | "provider"
  | "response";

export type DeepMindV1BetaModelsErrorCode =
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

export type DeepMindV1BetaModelsGate = {
  accepted: boolean;
  reason?: string;
};

export type DeepMindV1BetaModelsRuntimeContext = {
  runtimeId?: string;
  correlationId?: string;
  callerId?: string;
};

export type DeepMindV1BetaModelsQuery = Readonly<Record<string, string | number | boolean | undefined>>;

export type DeepMindV1BetaModelsAuthEnvelope = {
  kind: "api-key" | "oauth" | "none";
  present: boolean;
  redactedToken?: string;
};

export type DeepMindV1BetaModelsProviderEnvelope = {
  provider: "deepmind";
  apiVersion: "v1beta";
  endpoint: typeof DEEPMIND_V1BETA_MODELS_ENDPOINT;
  operation: string;
  method: "GET";
  urlPath: typeof DEEPMIND_V1BETA_MODELS_ENDPOINT;
  query: Readonly<Record<string, string>>;
  headers: Readonly<Record<string, string>>;
  runtime: Required<DeepMindV1BetaModelsRuntimeContext>;
  requestedScopes: readonly string[];
  grantedScopes: readonly string[];
  dryRun: boolean;
  unsafeSideEffects: false;
  providerFieldsOpaque: true;
};

export type DeepMindV1BetaModelsProviderCaller = (
  envelope: DeepMindV1BetaModelsProviderEnvelope,
) => unknown | Promise<unknown>;

export type DeepMindV1BetaModelsRequest = {
  operation?: string;
  query?: DeepMindV1BetaModelsQuery;
  headers?: Readonly<Record<string, string | undefined>>;
  auth?: DeepMindV1BetaModelsAuthEnvelope;
  runtime?: DeepMindV1BetaModelsRuntimeContext;
  requiredScopes?: readonly string[];
  allowedScopes?: readonly string[];
  contract?: DeepMindV1BetaModelsGate;
  governance?: DeepMindV1BetaModelsGate;
  dryRun?: boolean;
  mockResponse?: unknown;
  expectModelsArray?: boolean;
  caller?: DeepMindV1BetaModelsProviderCaller;
};

export type DeepMindV1BetaModelsResponseEnvelope = {
  provider: "deepmind";
  endpoint: typeof DEEPMIND_V1BETA_MODELS_ENDPOINT;
  mode: "dry-run" | "mock" | "caller";
  raw: unknown;
  providerFieldsOpaque: true;
};

export type DeepMindV1BetaModelsCapabilitySignal = {
  provider: "deepmind";
  endpoint: typeof DEEPMIND_V1BETA_MODELS_ENDPOINT;
  operation: string;
  rawShape: "models-list" | "dry-run" | "opaque-provider-payload";
};

export type DeepMindV1BetaModelsError = {
  code: DeepMindV1BetaModelsErrorCode;
  message: string;
  boundary: DeepMindV1BetaModelsBoundary;
  retryable: boolean;
};

export type DeepMindV1BetaModelsResult =
  | {
      ok: true;
      envelope: DeepMindV1BetaModelsProviderEnvelope;
      response: DeepMindV1BetaModelsResponseEnvelope;
      capability: DeepMindV1BetaModelsCapabilitySignal;
      events: readonly string[];
    }
  | {
      ok: false;
      error: DeepMindV1BetaModelsError;
      envelope?: DeepMindV1BetaModelsProviderEnvelope;
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

function cleanQuery(query: DeepMindV1BetaModelsQuery | undefined): Readonly<Record<string, string>> {
  return Object.fromEntries(
    Object.entries(query ?? {})
      .filter((entry): entry is [string, string | number | boolean] => entry[1] !== undefined)
      .map(([key, value]) => [key.trim(), String(value)]),
  );
}

function cleanHeaders(headers: DeepMindV1BetaModelsRequest["headers"]): Readonly<Record<string, string>> {
  return Object.fromEntries(
    Object.entries(headers ?? {})
      .filter((entry): entry is [string, string] => typeof entry[1] === "string" && entry[1].trim().length > 0)
      .map(([key, value]) => [key.trim().toLowerCase(), value.trim()]),
  );
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
  code: DeepMindV1BetaModelsErrorCode,
  message: string,
  boundary: DeepMindV1BetaModelsBoundary,
  retryable = false,
  envelope?: DeepMindV1BetaModelsProviderEnvelope,
): DeepMindV1BetaModelsResult {
  return {
    ok: false,
    error: { code, message, boundary, retryable },
    envelope,
    events: ["agentCore.modelAdapter.deepmind.v1beta.models.rejected"],
  };
}

export function classifyDeepMindV1BetaModelsProviderError(error: unknown): DeepMindV1BetaModelsErrorCode {
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

function assertModelsArray(raw: unknown): boolean {
  return isRecord(raw) && Array.isArray(raw.models);
}

export async function invokeDeepMindV1BetaModels(
  request: DeepMindV1BetaModelsRequest = {},
): Promise<DeepMindV1BetaModelsResult> {
  if (!hasText(request.operation)) {
    return failure("MISSING_OPERATION", "DeepMind v1beta models invocation requires an explicit operation", "input");
  }

  if (!hasText(request.runtime?.runtimeId)) {
    return failure("MISSING_RUNTIME_ID", "DeepMind v1beta models invocation requires runtime.runtimeId", "input");
  }

  const operation = request.operation.trim();
  const runtime = request.runtime;
  const runtimeId = request.runtime.runtimeId.trim();

  if (request.contract?.accepted === false) {
    return failure(
      "CONTRACT_REJECTED",
      request.contract.reason ?? "DeepMind v1beta models invocation was rejected by contract checks",
      "contract",
    );
  }

  if (request.governance?.accepted === false) {
    return failure(
      "GOVERNANCE_REJECTED",
      request.governance.reason ?? "DeepMind v1beta models invocation was rejected by governance",
      "governance",
    );
  }

  if (request.auth?.present === false) {
    return failure("AUTH_REJECTED", "DeepMind v1beta models auth envelope is marked as unavailable", "auth");
  }

  const requestedScopes = cleanScopes(request.requiredScopes);
  const allowedScopes = cleanScopes(request.allowedScopes);
  const deniedScopes =
    allowedScopes.length === 0 ? [] : requestedScopes.filter((scope) => !allowedScopes.includes(scope));

  if (deniedScopes.length > 0) {
    return failure(
      "SCOPE_DENIED",
      `DeepMind v1beta models invocation requested scopes outside the allowed boundary: ${deniedScopes.join(", ")}`,
      "scope",
    );
  }

  const envelope: DeepMindV1BetaModelsProviderEnvelope = {
    provider: "deepmind",
    apiVersion: "v1beta",
    endpoint: DEEPMIND_V1BETA_MODELS_ENDPOINT,
    operation,
    method: "GET",
    urlPath: DEEPMIND_V1BETA_MODELS_ENDPOINT,
    query: cleanQuery(request.query),
    headers: cleanHeaders(request.headers),
    runtime: {
      runtimeId,
      correlationId: runtime.correlationId?.trim() || "",
      callerId: runtime.callerId?.trim() || "",
    },
    requestedScopes,
    grantedScopes: requestedScopes,
    dryRun: request.dryRun !== false,
    unsafeSideEffects: false,
    providerFieldsOpaque: true,
  };

  if (envelope.dryRun) {
    return {
      ok: true,
      envelope,
      response: {
        provider: "deepmind",
        endpoint: DEEPMIND_V1BETA_MODELS_ENDPOINT,
        mode: request.mockResponse === undefined ? "dry-run" : "mock",
        raw: request.mockResponse ?? null,
        providerFieldsOpaque: true,
      },
      capability: {
        provider: "deepmind",
        endpoint: DEEPMIND_V1BETA_MODELS_ENDPOINT,
        operation,
        rawShape: request.mockResponse === undefined ? "dry-run" : "opaque-provider-payload",
      },
      events: ["agentCore.modelAdapter.deepmind.v1beta.models.dryRun"],
    };
  }

  if (request.caller === undefined) {
    return failure(
      "CALLER_REQUIRED",
      "DeepMind v1beta models live invocation requires an injected provider caller",
      "provider",
      false,
      envelope,
    );
  }

  try {
    const raw = await request.caller(envelope);
    if (request.expectModelsArray === true && !assertModelsArray(raw)) {
      return failure(
        "RESPONSE_FORMAT_DRIFT",
        "DeepMind v1beta models provider response did not contain a models array",
        "response",
        false,
        envelope,
      );
    }

    return {
      ok: true,
      envelope,
      response: {
        provider: "deepmind",
        endpoint: DEEPMIND_V1BETA_MODELS_ENDPOINT,
        mode: "caller",
        raw,
        providerFieldsOpaque: true,
      },
      capability: {
        provider: "deepmind",
        endpoint: DEEPMIND_V1BETA_MODELS_ENDPOINT,
        operation,
        rawShape: request.expectModelsArray === true ? "models-list" : "opaque-provider-payload",
      },
      events: ["agentCore.modelAdapter.deepmind.v1beta.models.called"],
    };
  } catch (error) {
    const code = classifyDeepMindV1BetaModelsProviderError(error);
    return failure(
      code,
      `DeepMind v1beta models provider caller failed with ${code}`,
      "provider",
      code === "PROVIDER_RATE_LIMITED" || code === "PROVIDER_TIMEOUT" || code === "PROVIDER_UNAVAILABLE",
      envelope,
    );
  }
}
