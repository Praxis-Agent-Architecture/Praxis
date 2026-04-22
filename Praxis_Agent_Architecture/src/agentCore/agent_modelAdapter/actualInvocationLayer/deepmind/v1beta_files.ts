/*
 * 文件定位：Agent 模型适配层 / 真实上游调用层 / DeepMind/Gemini 官方调用面。
 * 核心目的：承接 DeepMind/Gemini 上游的 v1beta files 真实调用面。
 * 能力要求1：需要把对应 endpoint 的请求参数、响应形态、错误形态和能力信号整理成可适配对象。
 * 能力要求2：鉴权/API 登录后续会接入，但这里要为“上游能力变得实际可用”预留位置。
 * 能力要求3：不把该 provider 的字段形状提升为 Praxis 统一语义，只作为 actualInvocationLayer 的现实入口。
 * 边界：只处理上游实际调用面，不在这里定义 agentCore 使用 AI 的统一方式。
 * 对接：需要被 runtime.modelAdapter 拉起，并和 provider/carrier、PromptPack lowering、能力抽象链路接通。
 * 实现提示：先补稳定类型契约、最小可测行为和清晰错误边界，再接入真实执行逻辑。
 */

export const DEEPMIND_V1BETA_FILES_ENDPOINT = "/v1beta/files" as const;

export type DeepMindV1BetaFilesMethod = "GET" | "POST" | "PATCH" | "DELETE";

export type DeepMindV1BetaFilesGate = {
  accepted: boolean;
  reason?: string;
};

export type DeepMindV1BetaFilesRuntimeContext = {
  runtimeId?: string;
  correlationId?: string;
  callerId?: string;
};

export type DeepMindV1BetaFilesAuthEnvelope = {
  kind: "api-key" | "oauth" | "none";
  present: boolean;
  redactedToken?: string;
};

export type DeepMindV1BetaFilesRequestEnvelope = {
  provider: "deepmind";
  apiVersion: "v1beta";
  endpoint: typeof DEEPMIND_V1BETA_FILES_ENDPOINT;
  operation: string;
  method: DeepMindV1BetaFilesMethod;
  urlPath: string;
  query: Readonly<Record<string, string>>;
  headers: Readonly<Record<string, string>>;
  body?: unknown;
  runtime: Required<DeepMindV1BetaFilesRuntimeContext>;
  requestedScopes: readonly string[];
  grantedScopes: readonly string[];
  dryRun: boolean;
  unsafeSideEffects: false;
  providerFieldsOpaque: true;
};

export type DeepMindV1BetaFilesProviderCaller = (
  envelope: DeepMindV1BetaFilesRequestEnvelope,
) => unknown | Promise<unknown>;

export type DeepMindV1BetaFilesInvocationRequest = {
  operation?: string;
  method?: DeepMindV1BetaFilesMethod;
  pathSuffix?: string;
  query?: Readonly<Record<string, string | number | boolean | undefined>>;
  headers?: Readonly<Record<string, string | undefined>>;
  body?: unknown;
  auth?: DeepMindV1BetaFilesAuthEnvelope;
  runtime?: DeepMindV1BetaFilesRuntimeContext;
  requiredScopes?: readonly string[];
  allowedScopes?: readonly string[];
  contract?: DeepMindV1BetaFilesGate;
  governance?: DeepMindV1BetaFilesGate;
  dryRun?: boolean;
  mockResponse?: unknown;
  expectResponseObject?: boolean;
  caller?: DeepMindV1BetaFilesProviderCaller;
};

export type DeepMindV1BetaFilesErrorCode =
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

export type DeepMindV1BetaFilesError = {
  code: DeepMindV1BetaFilesErrorCode;
  message: string;
  boundary: "input" | "contract" | "governance" | "auth" | "scope" | "provider";
  retryable: boolean;
};

export type DeepMindV1BetaFilesProviderResponseEnvelope = {
  provider: "deepmind";
  endpoint: typeof DEEPMIND_V1BETA_FILES_ENDPOINT;
  mode: "dry-run" | "mock" | "caller";
  raw: unknown;
  providerFieldsOpaque: true;
};

export type DeepMindV1BetaFilesCapabilitySignal = {
  provider: "deepmind";
  endpoint: typeof DEEPMIND_V1BETA_FILES_ENDPOINT;
  operation: string;
  rawShape: "opaque-provider-payload";
};

export type DeepMindV1BetaFilesInvocationResult =
  | {
      ok: true;
      request: DeepMindV1BetaFilesRequestEnvelope;
      response: DeepMindV1BetaFilesProviderResponseEnvelope;
      capability: DeepMindV1BetaFilesCapabilitySignal;
      events: readonly string[];
    }
  | {
      ok: false;
      error: DeepMindV1BetaFilesError;
      request?: DeepMindV1BetaFilesRequestEnvelope;
      events: readonly string[];
    };

function hasText(value: string | undefined): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

function cleanScopes(scopes: readonly string[] | undefined): readonly string[] {
  return [...new Set((scopes ?? []).map((scope) => scope.trim()).filter(Boolean))];
}

function cleanQuery(query: DeepMindV1BetaFilesInvocationRequest["query"]): Readonly<Record<string, string>> {
  return Object.fromEntries(
    Object.entries(query ?? {})
      .filter((entry): entry is [string, string | number | boolean] => entry[1] !== undefined)
      .map(([key, value]) => [key.trim(), String(value)]),
  );
}

function cleanHeaders(headers: DeepMindV1BetaFilesInvocationRequest["headers"]): Readonly<Record<string, string>> {
  return Object.fromEntries(
    Object.entries(headers ?? {})
      .filter((entry): entry is [string, string] => typeof entry[1] === "string" && entry[1].trim().length > 0)
      .map(([key, value]) => [key.trim().toLowerCase(), value.trim()]),
  );
}

function buildUrlPath(pathSuffix: string | undefined): string {
  const suffix = pathSuffix?.trim().replace(/^\/+/, "").replace(/\/+$/, "");
  return suffix ? `${DEEPMIND_V1BETA_FILES_ENDPOINT}/${suffix}` : DEEPMIND_V1BETA_FILES_ENDPOINT;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
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
  code: DeepMindV1BetaFilesErrorCode,
  message: string,
  boundary: DeepMindV1BetaFilesError["boundary"],
  retryable = false,
  request?: DeepMindV1BetaFilesRequestEnvelope,
): DeepMindV1BetaFilesInvocationResult {
  return {
    ok: false,
    error: { code, message, boundary, retryable },
    request,
    events: ["agentCore.modelAdapter.deepmind.v1beta.files.rejected"],
  };
}

export function classifyDeepMindV1BetaFilesProviderError(error: unknown): DeepMindV1BetaFilesErrorCode {
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

export async function invokeDeepMindV1BetaFiles(
  input: DeepMindV1BetaFilesInvocationRequest = {},
): Promise<DeepMindV1BetaFilesInvocationResult> {
  if (!hasText(input.operation)) {
    return failure("MISSING_OPERATION", "DeepMind v1beta files invocation requires an explicit operation", "input");
  }

  if (!hasText(input.runtime?.runtimeId)) {
    return failure("MISSING_RUNTIME_ID", "DeepMind v1beta files invocation requires runtime.runtimeId", "input");
  }

  const operation = input.operation.trim();
  const runtime = input.runtime;
  const runtimeId = input.runtime.runtimeId.trim();

  if (input.contract?.accepted === false) {
    return failure("CONTRACT_REJECTED", input.contract.reason ?? "DeepMind v1beta files contract rejected the request", "contract");
  }

  if (input.governance?.accepted === false) {
    return failure(
      "GOVERNANCE_REJECTED",
      input.governance.reason ?? "DeepMind v1beta files governance rejected the request",
      "governance",
    );
  }

  if (input.auth?.present === false) {
    return failure("AUTH_REJECTED", "DeepMind v1beta files auth envelope is marked as unavailable", "auth");
  }

  const requestedScopes = cleanScopes(input.requiredScopes);
  const allowedScopes = cleanScopes(input.allowedScopes);
  const deniedScopes =
    allowedScopes.length === 0 ? [] : requestedScopes.filter((scope) => !allowedScopes.includes(scope));

  if (deniedScopes.length > 0) {
    return failure(
      "SCOPE_DENIED",
      `DeepMind v1beta files invocation requested scopes outside the allowed boundary: ${deniedScopes.join(", ")}`,
      "scope",
    );
  }

  const request: DeepMindV1BetaFilesRequestEnvelope = {
    provider: "deepmind",
    apiVersion: "v1beta",
    endpoint: DEEPMIND_V1BETA_FILES_ENDPOINT,
    operation,
    method: input.method ?? "GET",
    urlPath: buildUrlPath(input.pathSuffix),
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
        endpoint: DEEPMIND_V1BETA_FILES_ENDPOINT,
        mode: input.mockResponse === undefined ? "dry-run" : "mock",
        raw: input.mockResponse ?? null,
        providerFieldsOpaque: true,
      },
      capability: {
        provider: "deepmind",
        endpoint: DEEPMIND_V1BETA_FILES_ENDPOINT,
        operation,
        rawShape: "opaque-provider-payload",
      },
      events: ["agentCore.modelAdapter.deepmind.v1beta.files.dryRun"],
    };
  }

  if (input.caller === undefined) {
    return failure(
      "CALLER_REQUIRED",
      "DeepMind v1beta files live invocation requires an injected provider caller",
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
        "DeepMind v1beta files provider response did not match the expected object envelope",
        "provider",
        false,
        request,
      );
    }

    return {
      ok: true,
      request,
      response: {
        provider: "deepmind",
        endpoint: DEEPMIND_V1BETA_FILES_ENDPOINT,
        mode: "caller",
        raw,
        providerFieldsOpaque: true,
      },
      capability: {
        provider: "deepmind",
        endpoint: DEEPMIND_V1BETA_FILES_ENDPOINT,
        operation,
        rawShape: "opaque-provider-payload",
      },
      events: ["agentCore.modelAdapter.deepmind.v1beta.files.called"],
    };
  } catch (error) {
    const code = classifyDeepMindV1BetaFilesProviderError(error);
    return failure(
      code,
      `DeepMind v1beta files provider caller failed with ${code}`,
      "provider",
      code === "PROVIDER_RATE_LIMITED" || code === "PROVIDER_TIMEOUT" || code === "PROVIDER_UNAVAILABLE",
      request,
    );
  }
}
