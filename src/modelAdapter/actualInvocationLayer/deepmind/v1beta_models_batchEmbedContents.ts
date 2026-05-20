/*
 * 文件定位：Agent 模型适配层 / 真实上游调用层 / DeepMind/Gemini 官方调用面。
 * 核心目的：承接 DeepMind/Gemini 上游的 v1beta models batch Embed Contents 真实调用面。
 * 能力要求1：需要把对应 endpoint 的请求参数、响应形态、错误形态和能力信号整理成可适配对象。
 * 能力要求2：鉴权/API 登录后续会接入，但这里要为“上游能力变得实际可用”预留位置。
 * 能力要求3：不把该 provider 的字段形状提升为 Praxis 统一语义，只作为 actualInvocationLayer 的现实入口。
 * 边界：只处理上游实际调用面，不在这里定义 agentCore 使用 AI 的统一方式。
 * 对接：需要被 runtime.modelAdapter 拉起，并和 provider/carrier、PromptPack lowering、能力抽象链路接通。
 * 实现提示：先补稳定类型契约、最小可测行为和清晰错误边界，再接入真实执行逻辑。
 */

export const DEEPMIND_V1BETA_MODELS_BATCH_EMBED_CONTENTS_ENDPOINT =
  "/v1beta/models/batchEmbedContents" as const;

export type DeepMindV1BetaModelsBatchEmbedContentsGate = {
  accepted: boolean;
  reason?: string;
};

export type DeepMindV1BetaModelsBatchEmbedContentsRuntimeContext = {
  runtimeId?: string;
  correlationId?: string;
  callerId?: string;
};

export type DeepMindV1BetaModelsBatchEmbedContentsAuthEnvelope = {
  kind: "api-key" | "oauth" | "none";
  present: boolean;
  redactedToken?: string;
};

export type DeepMindV1BetaModelsBatchEmbedContentsRequestEnvelope = {
  provider: "deepmind";
  apiVersion: "v1beta";
  endpoint: typeof DEEPMIND_V1BETA_MODELS_BATCH_EMBED_CONTENTS_ENDPOINT;
  operation: "batchEmbedContents";
  method: "POST";
  urlPath: typeof DEEPMIND_V1BETA_MODELS_BATCH_EMBED_CONTENTS_ENDPOINT;
  query: Readonly<Record<string, string>>;
  headers: Readonly<Record<string, string>>;
  body: unknown;
  runtime: Required<DeepMindV1BetaModelsBatchEmbedContentsRuntimeContext>;
  requestedScopes: readonly string[];
  grantedScopes: readonly string[];
  dryRun: boolean;
  unsafeSideEffects: false;
  providerFieldsOpaque: true;
};

export type DeepMindV1BetaModelsBatchEmbedContentsProviderCaller = (
  envelope: DeepMindV1BetaModelsBatchEmbedContentsRequestEnvelope,
) => unknown | Promise<unknown>;

export type DeepMindV1BetaModelsBatchEmbedContentsInvocationRequest = {
  query?: Readonly<Record<string, string | number | boolean | undefined>>;
  headers?: Readonly<Record<string, string | undefined>>;
  body?: unknown;
  auth?: DeepMindV1BetaModelsBatchEmbedContentsAuthEnvelope;
  runtime?: DeepMindV1BetaModelsBatchEmbedContentsRuntimeContext;
  requiredScopes?: readonly string[];
  allowedScopes?: readonly string[];
  contract?: DeepMindV1BetaModelsBatchEmbedContentsGate;
  governance?: DeepMindV1BetaModelsBatchEmbedContentsGate;
  dryRun?: boolean;
  mockResponse?: unknown;
  expectEmbeddingsArray?: boolean;
  caller?: DeepMindV1BetaModelsBatchEmbedContentsProviderCaller;
};

export type DeepMindV1BetaModelsBatchEmbedContentsErrorCode =
  | "MISSING_RUNTIME_ID"
  | "MISSING_BODY"
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

export type DeepMindV1BetaModelsBatchEmbedContentsError = {
  code: DeepMindV1BetaModelsBatchEmbedContentsErrorCode;
  message: string;
  boundary: "input" | "contract" | "governance" | "auth" | "scope" | "provider" | "response";
  retryable: boolean;
};

export type DeepMindV1BetaModelsBatchEmbedContentsProviderResponseEnvelope = {
  provider: "deepmind";
  endpoint: typeof DEEPMIND_V1BETA_MODELS_BATCH_EMBED_CONTENTS_ENDPOINT;
  mode: "dry-run" | "mock" | "caller";
  raw: unknown;
  providerFieldsOpaque: true;
};

export type DeepMindV1BetaModelsBatchEmbedContentsCapabilitySignal = {
  provider: "deepmind";
  endpoint: typeof DEEPMIND_V1BETA_MODELS_BATCH_EMBED_CONTENTS_ENDPOINT;
  operation: "batchEmbedContents";
  rawShape: "embeddings-list" | "dry-run" | "opaque-provider-payload";
};

export type DeepMindV1BetaModelsBatchEmbedContentsInvocationResult =
  | {
      ok: true;
      request: DeepMindV1BetaModelsBatchEmbedContentsRequestEnvelope;
      response: DeepMindV1BetaModelsBatchEmbedContentsProviderResponseEnvelope;
      capability: DeepMindV1BetaModelsBatchEmbedContentsCapabilitySignal;
      events: readonly string[];
    }
  | {
      ok: false;
      error: DeepMindV1BetaModelsBatchEmbedContentsError;
      request?: DeepMindV1BetaModelsBatchEmbedContentsRequestEnvelope;
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

function cleanQuery(
  query: DeepMindV1BetaModelsBatchEmbedContentsInvocationRequest["query"],
): Readonly<Record<string, string>> {
  return Object.fromEntries(
    Object.entries(query ?? {})
      .filter((entry): entry is [string, string | number | boolean] => entry[1] !== undefined)
      .map(([key, value]) => [key.trim(), String(value)]),
  );
}

function cleanHeaders(
  headers: DeepMindV1BetaModelsBatchEmbedContentsInvocationRequest["headers"],
): Readonly<Record<string, string>> {
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
  code: DeepMindV1BetaModelsBatchEmbedContentsErrorCode,
  message: string,
  boundary: DeepMindV1BetaModelsBatchEmbedContentsError["boundary"],
  retryable = false,
  request?: DeepMindV1BetaModelsBatchEmbedContentsRequestEnvelope,
): DeepMindV1BetaModelsBatchEmbedContentsInvocationResult {
  return {
    ok: false,
    error: { code, message, boundary, retryable },
    request,
    events: ["agentCore.modelAdapter.deepmind.v1beta.models.batchEmbedContents.rejected"],
  };
}

export function classifyDeepMindV1BetaModelsBatchEmbedContentsProviderError(
  error: unknown,
): DeepMindV1BetaModelsBatchEmbedContentsErrorCode {
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

function hasEmbeddingsArray(raw: unknown): boolean {
  return isRecord(raw) && Array.isArray(raw.embeddings);
}

export async function invokeDeepMindV1BetaModelsBatchEmbedContents(
  input: DeepMindV1BetaModelsBatchEmbedContentsInvocationRequest = {},
): Promise<DeepMindV1BetaModelsBatchEmbedContentsInvocationResult> {
  if (!hasText(input.runtime?.runtimeId)) {
    return failure(
      "MISSING_RUNTIME_ID",
      "DeepMind v1beta models batchEmbedContents invocation requires runtime.runtimeId",
      "input",
    );
  }

  if (input.body === undefined) {
    return failure("MISSING_BODY", "DeepMind v1beta models batchEmbedContents invocation requires a request body", "input");
  }

  const runtime = input.runtime;
  const runtimeId = input.runtime.runtimeId.trim();

  if (input.contract?.accepted === false) {
    return failure(
      "CONTRACT_REJECTED",
      input.contract.reason ?? "DeepMind v1beta models batchEmbedContents contract rejected the request",
      "contract",
    );
  }

  if (input.governance?.accepted === false) {
    return failure(
      "GOVERNANCE_REJECTED",
      input.governance.reason ?? "DeepMind v1beta models batchEmbedContents governance rejected the request",
      "governance",
    );
  }

  if (input.auth?.present === false) {
    return failure("AUTH_REJECTED", "DeepMind v1beta models batchEmbedContents auth envelope is unavailable", "auth");
  }

  const requestedScopes = cleanScopes(input.requiredScopes);
  const allowedScopes = cleanScopes(input.allowedScopes);
  const deniedScopes =
    allowedScopes.length === 0 ? [] : requestedScopes.filter((scope) => !allowedScopes.includes(scope));

  if (deniedScopes.length > 0) {
    return failure(
      "SCOPE_DENIED",
      `DeepMind v1beta models batchEmbedContents requested scopes outside the allowed boundary: ${deniedScopes.join(", ")}`,
      "scope",
    );
  }

  const request: DeepMindV1BetaModelsBatchEmbedContentsRequestEnvelope = {
    provider: "deepmind",
    apiVersion: "v1beta",
    endpoint: DEEPMIND_V1BETA_MODELS_BATCH_EMBED_CONTENTS_ENDPOINT,
    operation: "batchEmbedContents",
    method: "POST",
    urlPath: DEEPMIND_V1BETA_MODELS_BATCH_EMBED_CONTENTS_ENDPOINT,
    query: cleanQuery(input.query),
    headers: cleanHeaders(input.headers),
    body: input.body,
    runtime: {
      runtimeId,
      correlationId: runtime.correlationId?.trim() || "",
      callerId: runtime.callerId?.trim() || "",
    },
    requestedScopes,
    grantedScopes: requestedScopes,
    dryRun: input.dryRun !== false,
    unsafeSideEffects: false,
    providerFieldsOpaque: true,
  };

  if (request.dryRun) {
    return {
      ok: true,
      request,
      response: {
        provider: "deepmind",
        endpoint: DEEPMIND_V1BETA_MODELS_BATCH_EMBED_CONTENTS_ENDPOINT,
        mode: input.mockResponse === undefined ? "dry-run" : "mock",
        raw: input.mockResponse ?? null,
        providerFieldsOpaque: true,
      },
      capability: {
        provider: "deepmind",
        endpoint: DEEPMIND_V1BETA_MODELS_BATCH_EMBED_CONTENTS_ENDPOINT,
        operation: "batchEmbedContents",
        rawShape: input.mockResponse === undefined ? "dry-run" : "opaque-provider-payload",
      },
      events: ["agentCore.modelAdapter.deepmind.v1beta.models.batchEmbedContents.dryRun"],
    };
  }

  if (input.caller === undefined) {
    return failure(
      "CALLER_REQUIRED",
      "DeepMind v1beta models batchEmbedContents live invocation requires an injected provider caller",
      "provider",
      false,
      request,
    );
  }

  try {
    const raw = await input.caller(request);
    if (input.expectEmbeddingsArray === true && !hasEmbeddingsArray(raw)) {
      return failure(
        "RESPONSE_FORMAT_DRIFT",
        "DeepMind v1beta models batchEmbedContents response did not contain an embeddings array",
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
        endpoint: DEEPMIND_V1BETA_MODELS_BATCH_EMBED_CONTENTS_ENDPOINT,
        mode: "caller",
        raw,
        providerFieldsOpaque: true,
      },
      capability: {
        provider: "deepmind",
        endpoint: DEEPMIND_V1BETA_MODELS_BATCH_EMBED_CONTENTS_ENDPOINT,
        operation: "batchEmbedContents",
        rawShape: input.expectEmbeddingsArray === true ? "embeddings-list" : "opaque-provider-payload",
      },
      events: ["agentCore.modelAdapter.deepmind.v1beta.models.batchEmbedContents.called"],
    };
  } catch (error) {
    const code = classifyDeepMindV1BetaModelsBatchEmbedContentsProviderError(error);
    return failure(
      code,
      `DeepMind v1beta models batchEmbedContents provider caller failed with ${code}`,
      "provider",
      code === "PROVIDER_RATE_LIMITED" || code === "PROVIDER_TIMEOUT" || code === "PROVIDER_UNAVAILABLE",
      request,
    );
  }
}
