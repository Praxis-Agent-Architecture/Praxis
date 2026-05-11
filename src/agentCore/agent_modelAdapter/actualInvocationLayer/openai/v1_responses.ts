/*
 * 文件定位：Agent 模型适配层 / 真实上游调用层 / OpenAI 官方调用面。
 * 核心目的：承接 OpenAI 上游的 v1 responses 真实调用面。
 * 能力要求1：需要把对应 endpoint 的请求参数、响应形态、错误形态和能力信号整理成可适配对象。
 * 能力要求2：鉴权/API 登录后续会接入，但这里要为“上游能力变得实际可用”预留位置。
 * 能力要求3：不把该 provider 的字段形状提升为 Praxis 统一语义，只作为 actualInvocationLayer 的现实入口。
 * 边界：只处理上游实际调用面，不在这里定义 agentCore 使用 AI 的统一方式。
 * 对接：需要被 runtime.modelAdapter 拉起，并和 provider/carrier、PromptPack lowering、能力抽象链路接通。
 * 实现提示：先补稳定类型契约、最小可测行为和清晰错误边界，再接入真实执行逻辑。
 */

import type { AuthEnvelope } from "../../authProfileLayer/authEnvelope.js";
import { unwrapProviderCallerBody } from "../../providerAccessLayer/providerCaller.js";

export const OPENAI_V1_RESPONSES_ENDPOINT = "/v1/responses" as const;
export const DEFAULT_OPENAI_V1_RESPONSES_BASE_URL = "https://api.openai.com" as const;

export type OpenAIV1ResponsesMethod = "GET" | "POST" | "PATCH" | "DELETE";

export type OpenAIV1ResponsesBoundary =
  | "input"
  | "contract"
  | "governance"
  | "auth"
  | "scope"
  | "provider"
  | "response";

export type OpenAIV1ResponsesErrorCode =
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

export type OpenAIV1ResponsesGate = {
  accepted: boolean;
  reason?: string;
};

export type OpenAIV1ResponsesRuntimeContext = {
  runtimeId?: string;
  invocationId?: string;
  traceId?: string;
  callerId?: string;
};

export type OpenAIV1ResponsesAuthEnvelope = {
  kind: "bearer" | "api-key" | "none";
  present: boolean;
  redactedToken?: string;
};

export type OpenAIV1ResponsesRequestEnvelope = {
  provider: "openai";
  apiVersion: "v1";
  endpoint: string;
  operation: string;
  method: OpenAIV1ResponsesMethod;
  url: string;
  pathSuffix: string;
  query: Readonly<Record<string, string>>;
  headers: Readonly<Record<string, string>>;
  body?: unknown;
  runtime: Required<OpenAIV1ResponsesRuntimeContext>;
  requestedScopes: readonly string[];
  grantedScopes: readonly string[];
  dryRun: boolean;
  providerCallPlanned: boolean;
  unsafeSideEffects: false;
  providerFieldsOpaque: true;
};

export type OpenAIV1ResponsesProviderCaller = (
  envelope: OpenAIV1ResponsesRequestEnvelope,
) => unknown | Promise<unknown>;

export type OpenAIV1ResponsesInvocationRequest = {
  operation?: string;
  method?: OpenAIV1ResponsesMethod;
  endpointPath?: string;
  pathSuffix?: string;
  query?: Readonly<Record<string, string | number | boolean | undefined>>;
  headers?: Readonly<Record<string, string | undefined>>;
  body?: unknown;
  baseUrl?: string;
  auth?: OpenAIV1ResponsesAuthEnvelope | AuthEnvelope;
  runtime?: OpenAIV1ResponsesRuntimeContext;
  requiredScopes?: readonly string[];
  allowedScopes?: readonly string[];
  contract?: OpenAIV1ResponsesGate;
  governance?: OpenAIV1ResponsesGate;
  dryRun?: boolean;
  mockResponse?: unknown;
  expectResponseObject?: boolean;
  caller?: OpenAIV1ResponsesProviderCaller;
};

export type OpenAIV1ResponsesResponseEnvelope = {
  provider: "openai";
  endpoint: string;
  mode: "dry-run" | "mock" | "caller";
  raw: unknown;
  usage?: OpenAIV1ResponsesUsage;
  providerFieldsOpaque: true;
};

export type OpenAIV1ResponsesUsage = {
  source: "openai.responses.usage";
  inputTokens?: number;
  outputTokens?: number;
  totalTokens?: number;
  cachedInputTokens?: number;
  reasoningTokens?: number;
  estimated: false;
};

export type OpenAIV1ResponsesCapabilitySignal = {
  provider: "openai";
  endpoint: string;
  operation: string;
  rawShape: "response-object" | "response-list" | "mock" | "dry-run";
};

export type OpenAIV1ResponsesError = {
  code: OpenAIV1ResponsesErrorCode;
  message: string;
  boundary: OpenAIV1ResponsesBoundary;
  retryable: boolean;
};

export type OpenAIV1ResponsesResult =
  | {
      ok: true;
      request: OpenAIV1ResponsesRequestEnvelope;
      response: OpenAIV1ResponsesResponseEnvelope;
      capability: OpenAIV1ResponsesCapabilitySignal;
      events: readonly string[];
    }
  | {
      ok: false;
      error: OpenAIV1ResponsesError;
      request?: OpenAIV1ResponsesRequestEnvelope;
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

function cleanQuery(query: OpenAIV1ResponsesInvocationRequest["query"]): Readonly<Record<string, string>> {
  return Object.fromEntries(
    Object.entries(query ?? {})
      .filter((entry): entry is [string, string | number | boolean] => entry[1] !== undefined)
      .map(([key, value]) => [key.trim(), String(value)]),
  );
}

function cleanHeaders(headers: OpenAIV1ResponsesInvocationRequest["headers"]): Readonly<Record<string, string>> {
  return Object.fromEntries(
    Object.entries(headers ?? {})
      .filter((entry): entry is [string, string] => typeof entry[1] === "string" && entry[1].trim().length > 0)
      .map(([key, value]) => [key.trim().toLowerCase(), value.trim()]),
  );
}

function authHeaderPlan(auth: OpenAIV1ResponsesInvocationRequest["auth"]): Readonly<Record<string, string>> {
  if (auth === undefined || !("headerPlan" in auth)) {
    return {};
  }

  return Object.fromEntries(auth.headerPlan.map((header) => [header.name.trim().toLowerCase(), String(header.value)]));
}

function normalizeBaseUrl(baseUrl: string | undefined): string {
  return hasText(baseUrl) ? baseUrl.trim().replace(/\/+$/, "") : DEFAULT_OPENAI_V1_RESPONSES_BASE_URL;
}

function normalizeEndpointPath(endpointPath: string | undefined): string {
  const cleaned = endpointPath?.trim().replace(/^\/+/, "").replace(/\/+$/, "");
  return `/${cleaned || OPENAI_V1_RESPONSES_ENDPOINT.replace(/^\/+/u, "")}`;
}

function cleanPathSuffix(pathSuffix: string | undefined): string {
  return pathSuffix?.trim().replace(/^\/+/, "").replace(/\/+$/, "") ?? "";
}

function buildUrl(baseUrl: string | undefined, endpointPath: string | undefined, pathSuffix: string | undefined): string {
  const suffix = cleanPathSuffix(pathSuffix);
  const endpoint = normalizeEndpointPath(endpointPath);
  return suffix
    ? `${normalizeBaseUrl(baseUrl)}${endpoint}/${suffix}`
    : `${normalizeBaseUrl(baseUrl)}${endpoint}`;
}

function failure(
  code: OpenAIV1ResponsesErrorCode,
  message: string,
  boundary: OpenAIV1ResponsesBoundary,
  retryable = false,
  request?: OpenAIV1ResponsesRequestEnvelope,
): OpenAIV1ResponsesResult {
  return {
    ok: false,
    error: { code, message, boundary, retryable },
    request,
    events: ["agentCore.modelAdapter.openai.v1.responses.rejected"],
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

function providerErrorMessage(error: unknown): string | undefined {
  if (!isRecord(error)) {
    return undefined;
  }

  const message = error.message ?? error.providerMessage;
  return typeof message === "string" && message.trim().length > 0
    ? message.trim().slice(0, 500)
    : undefined;
}

function inferRawShape(operation: string, raw: unknown): OpenAIV1ResponsesCapabilitySignal["rawShape"] {
  if (operation === "list" || (isRecord(raw) && Array.isArray(raw.data))) {
    return "response-list";
  }

  return "response-object";
}

function readFiniteNumber(record: Readonly<Record<string, unknown>> | undefined, keys: readonly string[]): number | undefined {
  if (record === undefined) {
    return undefined;
  }
  for (const key of keys) {
    const value = record[key];
    if (typeof value === "number" && Number.isFinite(value)) {
      return value;
    }
  }
  return undefined;
}

function sseDataObjects(text: string): readonly unknown[] {
  const objects: unknown[] = [];
  for (const line of text.split(/\r?\n/u)) {
    if (!line.startsWith("data:")) continue;
    const payload = line.slice("data:".length).trim();
    if (payload.length === 0 || payload === "[DONE]") continue;
    try {
      objects.push(JSON.parse(payload) as unknown);
    } catch {
      // Ignore non-JSON stream payloads.
    }
  }
  return objects;
}

function usageFromRecord(raw: Readonly<Record<string, unknown>>): OpenAIV1ResponsesUsage | undefined {
  const usage = isRecord(raw.usage)
    ? raw.usage
    : isRecord(raw.response) && isRecord(raw.response.usage)
      ? raw.response.usage
      : undefined;
  if (usage === undefined) {
    return undefined;
  }

  const inputDetails = isRecord(usage.input_tokens_details)
    ? usage.input_tokens_details
    : isRecord(usage.inputTokensDetails)
      ? usage.inputTokensDetails
      : undefined;
  const outputDetails = isRecord(usage.output_tokens_details)
    ? usage.output_tokens_details
    : isRecord(usage.outputTokensDetails)
      ? usage.outputTokensDetails
      : undefined;

  const inputTokens = readFiniteNumber(usage, ["input_tokens", "prompt_tokens", "inputTokens", "promptTokens"]);
  const outputTokens = readFiniteNumber(usage, ["output_tokens", "completion_tokens", "outputTokens", "completionTokens"]);
  const totalTokens = readFiniteNumber(usage, ["total_tokens", "totalTokens"]);
  const cachedInputTokens = readFiniteNumber(inputDetails, ["cached_tokens", "cachedTokens"]);
  const reasoningTokens = readFiniteNumber(outputDetails, ["reasoning_tokens", "reasoningTokens"])
    ?? readFiniteNumber(usage, ["reasoning_tokens", "thinking_tokens", "reasoningTokens", "thinkingTokens"]);

  if (
    inputTokens === undefined &&
    outputTokens === undefined &&
    totalTokens === undefined &&
    cachedInputTokens === undefined &&
    reasoningTokens === undefined
  ) {
    return undefined;
  }

  return {
    source: "openai.responses.usage",
    inputTokens,
    outputTokens,
    totalTokens,
    cachedInputTokens,
    reasoningTokens,
    estimated: false,
  };
}

export function extractOpenAIV1ResponsesUsage(raw: unknown): OpenAIV1ResponsesUsage | undefined {
  if (typeof raw === "string") {
    let latest: OpenAIV1ResponsesUsage | undefined;
    for (const object of sseDataObjects(raw)) {
      if (!isRecord(object)) continue;
      latest = extractOpenAIV1ResponsesUsage(object) ?? latest;
    }
    return latest;
  }

  if (!isRecord(raw)) {
    return undefined;
  }

  return usageFromRecord(raw);
}

export function classifyOpenAIV1ResponsesProviderError(error: unknown): OpenAIV1ResponsesErrorCode {
  const status = providerStatus(error);
  const code = providerCode(error);

  if (status === 401 || status === 403) {
    return "PROVIDER_AUTH_FAILED";
  }

  if (code.includes("provider_auth_failed")) {
    return "PROVIDER_AUTH_FAILED";
  }

  if (status === 429) {
    return "PROVIDER_RATE_LIMITED";
  }

  if (code.includes("provider_rate_limited")) {
    return "PROVIDER_RATE_LIMITED";
  }

  if (status === 408 || code.includes("timeout") || code.includes("abort")) {
    return "PROVIDER_TIMEOUT";
  }

  if (status !== undefined && status >= 500) {
    return "PROVIDER_UNAVAILABLE";
  }

  if (code.includes("provider_unavailable")) {
    return "PROVIDER_UNAVAILABLE";
  }

  if (code.includes("format") || code.includes("schema") || code.includes("parse") || code.includes("response_format_drift")) {
    return "RESPONSE_FORMAT_DRIFT";
  }

  return "CALLER_FAILED";
}

export async function invokeOpenAIV1Responses(
  input: OpenAIV1ResponsesInvocationRequest = {},
): Promise<OpenAIV1ResponsesResult> {
  if (!hasText(input.operation)) {
    return failure("MISSING_OPERATION", "OpenAI v1 responses invocation requires an explicit operation", "input");
  }

  const runtime = input.runtime;
  if (runtime === undefined || !hasText(runtime.runtimeId)) {
    return failure("MISSING_RUNTIME_ID", "OpenAI v1 responses invocation requires runtime.runtimeId", "input");
  }

  if (input.contract?.accepted === false) {
    return failure(
      "CONTRACT_REJECTED",
      input.contract.reason ?? "OpenAI v1 responses contract rejected the request",
      "contract",
    );
  }

  if (input.governance?.accepted === false) {
    return failure(
      "GOVERNANCE_REJECTED",
      input.governance.reason ?? "OpenAI v1 responses governance rejected the request",
      "governance",
    );
  }

  const liveMode = input.dryRun === false;
  if (liveMode && input.governance?.accepted !== true) {
    return failure(
      "GOVERNANCE_REJECTED",
      "OpenAI v1 responses live invocation requires affirmative runtime governance",
      "governance",
    );
  }

  if (liveMode && input.auth?.present !== true) {
    return failure("AUTH_REJECTED", "OpenAI v1 responses auth envelope is unavailable", "auth");
  }

  const requestedScopes = cleanScopes(input.requiredScopes);
  const allowedScopes = cleanScopes(input.allowedScopes);
  const deniedScopes =
    allowedScopes.length === 0 ? [] : requestedScopes.filter((scope) => !allowedScopes.includes(scope));

  if (deniedScopes.length > 0) {
    return failure(
      "SCOPE_DENIED",
      `OpenAI v1 responses requested scopes outside the allowed boundary: ${deniedScopes.join(", ")}`,
      "scope",
    );
  }

  const operation = input.operation.trim();
  const pathSuffix = cleanPathSuffix(input.pathSuffix);
  const request: OpenAIV1ResponsesRequestEnvelope = {
    provider: "openai",
    apiVersion: "v1",
    endpoint: normalizeEndpointPath(input.endpointPath),
    operation,
    method: input.method ?? "POST",
    url: buildUrl(input.baseUrl, input.endpointPath, input.pathSuffix),
    pathSuffix,
    query: cleanQuery(input.query),
    headers: {
      ...cleanHeaders(input.headers),
      ...authHeaderPlan(input.auth),
    },
    body: input.body,
    runtime: {
      runtimeId: runtime.runtimeId.trim(),
      invocationId: runtime.invocationId?.trim() || "",
      traceId: runtime.traceId?.trim() || "",
      callerId: runtime.callerId?.trim() || "",
    },
    requestedScopes,
    grantedScopes: requestedScopes,
    dryRun: !liveMode,
    providerCallPlanned: liveMode,
    unsafeSideEffects: false,
    providerFieldsOpaque: true,
  };

  if (request.dryRun) {
    return {
      ok: true,
      request,
      response: {
        provider: "openai",
        endpoint: request.endpoint,
        mode: input.mockResponse === undefined ? "dry-run" : "mock",
        raw: input.mockResponse ?? null,
        usage: extractOpenAIV1ResponsesUsage(input.mockResponse),
        providerFieldsOpaque: true,
      },
      capability: {
        provider: "openai",
        endpoint: request.endpoint,
        operation,
        rawShape: input.mockResponse === undefined ? "dry-run" : "mock",
      },
      events: ["agentCore.modelAdapter.openai.v1.responses.dryRun"],
    };
  }

  if (input.caller === undefined) {
    return failure(
      "CALLER_REQUIRED",
      "OpenAI v1 responses live invocation requires an injected provider caller",
      "provider",
      false,
      request,
    );
  }

  try {
    const raw = unwrapProviderCallerBody(await input.caller(request));
    const usage = extractOpenAIV1ResponsesUsage(raw);
    if (input.expectResponseObject === true && !isRecord(raw)) {
      return failure(
        "RESPONSE_FORMAT_DRIFT",
        "OpenAI v1 responses response did not match the expected object envelope",
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
        endpoint: request.endpoint,
        mode: "caller",
        raw,
        usage,
        providerFieldsOpaque: true,
      },
      capability: {
        provider: "openai",
        endpoint: request.endpoint,
        operation,
        rawShape: inferRawShape(operation, raw),
      },
      events: ["agentCore.modelAdapter.openai.v1.responses.called"],
    };
  } catch (error) {
    const code = classifyOpenAIV1ResponsesProviderError(error);
    const detail = providerErrorMessage(error);
    return failure(
      code,
      `OpenAI v1 responses provider caller failed with ${code}${detail === undefined ? "" : `: ${detail}`}`,
      code === "RESPONSE_FORMAT_DRIFT" ? "response" : "provider",
      code === "PROVIDER_RATE_LIMITED" || code === "PROVIDER_TIMEOUT" || code === "PROVIDER_UNAVAILABLE",
      request,
    );
  }
}
