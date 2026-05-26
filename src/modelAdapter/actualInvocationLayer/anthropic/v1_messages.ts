/*
 * 文件定位：Agent 模型适配层 / 真实上游调用层 / Anthropic 官方调用面。
 * 核心目的：承接 Anthropic 上游的 v1 messages 真实调用面。
 * 能力要求1：需要把对应 endpoint 的请求参数、响应形态、错误形态和能力信号整理成可适配对象。
 * 能力要求2：鉴权/API 登录后续会接入，但这里要为“上游能力变得实际可用”预留位置。
 * 能力要求3：不把该 provider 的字段形状提升为 Praxis 统一语义，只作为 actualInvocationLayer 的现实入口。
 * 边界：只处理上游实际调用面，不在这里定义 agentCore 使用 AI 的统一方式。
 * 对接：需要被 runtime.modelAdapter 拉起，并和 provider/carrier、PromptPack lowering、能力抽象链路接通。
 * 实现提示：先补稳定类型契约、最小可测行为和清晰错误边界，再接入真实执行逻辑。
 */

import type { AuthEnvelope } from "../../authProfileLayer/authEnvelope.js";
import { unwrapProviderCallerBody } from "../../providerAccessLayer/providerCaller.js";

export const ANTHROPIC_V1_MESSAGES_ENDPOINT = "/v1/messages" as const;

export type AnthropicV1MessagesMethod = "GET" | "POST" | "PATCH" | "DELETE";

export type AnthropicV1MessagesGate = {
  accepted: boolean;
  reason?: string;
};

export type AnthropicV1MessagesRuntimeContext = {
  runtimeId?: string;
  correlationId?: string;
  callerId?: string;
};

export type AnthropicV1MessagesAuthEnvelope = {
  kind: "api-key" | "bearer" | "none";
  present: boolean;
  redactedToken?: string;
};

export type AnthropicV1MessagesRequestEnvelope = {
  provider: "anthropic";
  apiVersion: "v1";
  endpoint: typeof ANTHROPIC_V1_MESSAGES_ENDPOINT;
  operation: string;
  method: AnthropicV1MessagesMethod;
  urlPath: string;
  query: Readonly<Record<string, string>>;
  headers: Readonly<Record<string, string>>;
  body?: unknown;
  runtime: Required<AnthropicV1MessagesRuntimeContext>;
  requestedScopes: readonly string[];
  grantedScopes: readonly string[];
  dryRun: boolean;
  signal?: AbortSignal;
  unsafeSideEffects: false;
  providerFieldsOpaque: true;
};

export type AnthropicV1MessagesProviderCaller = (
  envelope: AnthropicV1MessagesRequestEnvelope,
) => unknown | Promise<unknown>;

export type AnthropicV1MessagesInvocationRequest = {
  operation?: string;
  method?: AnthropicV1MessagesMethod;
  pathSuffix?: string;
  query?: Readonly<Record<string, string | number | boolean | undefined>>;
  headers?: Readonly<Record<string, string | undefined>>;
  body?: unknown;
  auth?: AnthropicV1MessagesAuthEnvelope | AuthEnvelope;
  runtime?: AnthropicV1MessagesRuntimeContext;
  requiredScopes?: readonly string[];
  allowedScopes?: readonly string[];
  contract?: AnthropicV1MessagesGate;
  governance?: AnthropicV1MessagesGate;
  dryRun?: boolean;
  mockResponse?: unknown;
  expectResponseObject?: boolean;
  caller?: AnthropicV1MessagesProviderCaller;
  signal?: AbortSignal;
};

export type AnthropicV1MessagesErrorCode =
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

export type AnthropicV1MessagesError = {
  code: AnthropicV1MessagesErrorCode;
  message: string;
  boundary: "input" | "contract" | "governance" | "auth" | "scope" | "provider";
  retryable: boolean;
};

export type AnthropicV1MessagesProviderResponseEnvelope = {
  provider: "anthropic";
  endpoint: typeof ANTHROPIC_V1_MESSAGES_ENDPOINT;
  mode: "dry-run" | "mock" | "caller";
  raw: unknown;
  usage?: AnthropicV1MessagesUsage;
  providerFieldsOpaque: true;
};

export type AnthropicV1MessagesUsage = {
  source: "anthropic.messages.usage";
  inputTokens?: number;
  outputTokens?: number;
  totalTokens?: number;
  cachedInputTokens?: number;
  estimated: false;
};

export type AnthropicV1MessagesInvocationResult =
  | {
      ok: true;
      request: AnthropicV1MessagesRequestEnvelope;
      response: AnthropicV1MessagesProviderResponseEnvelope;
      events: readonly string[];
    }
  | {
      ok: false;
      error: AnthropicV1MessagesError;
      request?: AnthropicV1MessagesRequestEnvelope;
      events: readonly string[];
    };

function isBlank(value: string | undefined): boolean {
  return typeof value !== "string" || value.trim().length === 0;
}

function hasText(value: string | undefined): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

function cleanScopes(scopes: readonly string[] | undefined): readonly string[] {
  return [...new Set((scopes ?? []).map((scope) => scope.trim()).filter(Boolean))];
}

function cleanQuery(query: AnthropicV1MessagesInvocationRequest["query"]): Readonly<Record<string, string>> {
  return Object.fromEntries(
    Object.entries(query ?? {})
      .filter((entry): entry is [string, string | number | boolean] => entry[1] !== undefined)
      .map(([key, value]) => [key.trim(), String(value)]),
  );
}

function cleanHeaders(headers: AnthropicV1MessagesInvocationRequest["headers"]): Readonly<Record<string, string>> {
  return Object.fromEntries(
    Object.entries(headers ?? {})
      .filter((entry): entry is [string, string] => typeof entry[1] === "string" && entry[1].trim().length > 0)
      .map(([key, value]) => [key.trim().toLowerCase(), value.trim()]),
  );
}

function authHeaderPlan(auth: AnthropicV1MessagesInvocationRequest["auth"]): Readonly<Record<string, string>> {
  if (auth === undefined || !("headerPlan" in auth)) return {};
  return Object.fromEntries(auth.headerPlan.map((header) => [header.name.trim().toLowerCase(), String(header.value)]));
}

function buildUrlPath(pathSuffix: string | undefined): string {
  const suffix = pathSuffix?.trim().replace(/^\/+/, "").replace(/\/+$/, "");
  return suffix ? `${ANTHROPIC_V1_MESSAGES_ENDPOINT}/${suffix}` : ANTHROPIC_V1_MESSAGES_ENDPOINT;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
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

function mergeAnthropicUsage(
  previous: AnthropicV1MessagesUsage | undefined,
  next: AnthropicV1MessagesUsage | undefined,
): AnthropicV1MessagesUsage | undefined {
  if (next === undefined) return previous;
  if (previous === undefined) return next;
  return {
    source: "anthropic.messages.usage",
    inputTokens: next.inputTokens ?? previous.inputTokens,
    outputTokens: next.outputTokens ?? previous.outputTokens,
    totalTokens: next.totalTokens ?? previous.totalTokens,
    cachedInputTokens: next.cachedInputTokens ?? previous.cachedInputTokens,
    estimated: false,
  };
}

export function extractAnthropicV1MessagesUsage(raw: unknown): AnthropicV1MessagesUsage | undefined {
  if (typeof raw === "string") {
    let latest: AnthropicV1MessagesUsage | undefined;
    for (const object of sseDataObjects(raw)) {
      latest = mergeAnthropicUsage(latest, extractAnthropicV1MessagesUsage(object));
    }
    return latest;
  }

  if (!isRecord(raw) || !isRecord(raw.usage)) {
    if (isRecord(raw) && isRecord(raw.message)) {
      return extractAnthropicV1MessagesUsage(raw.message);
    }
    return undefined;
  }
  const usage = raw.usage;
  const rawInputTokens = readFiniteNumber(usage, ["input_tokens", "inputTokens"]);
  const outputTokens = readFiniteNumber(usage, ["output_tokens", "outputTokens"]);
  const totalTokens = readFiniteNumber(usage, ["total_tokens", "totalTokens"]);
  const cacheCreationInputTokens = readFiniteNumber(usage, ["cache_creation_input_tokens", "cacheCreationInputTokens"]);
  const cachedInputTokens = readFiniteNumber(usage, ["cache_read_input_tokens", "cached_tokens", "cachedTokens"]);
  // Anthropic-style cache usage reports cache read/create tokens outside input_tokens.
  const inputTokens = rawInputTokens === undefined && cacheCreationInputTokens === undefined && cachedInputTokens === undefined
    ? undefined
    : (rawInputTokens ?? 0) + (cacheCreationInputTokens ?? 0) + (cachedInputTokens ?? 0);
  if (
    inputTokens === undefined &&
    outputTokens === undefined &&
    totalTokens === undefined &&
    cachedInputTokens === undefined
  ) {
    return undefined;
  }
  return {
    source: "anthropic.messages.usage",
    inputTokens,
    outputTokens,
    totalTokens,
    cachedInputTokens,
    estimated: false,
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

function failure(
  code: AnthropicV1MessagesErrorCode,
  message: string,
  boundary: AnthropicV1MessagesError["boundary"],
  retryable = false,
  request?: AnthropicV1MessagesRequestEnvelope,
): AnthropicV1MessagesInvocationResult {
  return {
    ok: false,
    error: { code, message, boundary, retryable },
    request,
    events: ["agentCore.modelAdapter.anthropic.v1.messages.rejected"],
  };
}

export function classifyAnthropicV1MessagesProviderError(error: unknown): AnthropicV1MessagesErrorCode {
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

export async function invokeAnthropicV1Messages(
  input: AnthropicV1MessagesInvocationRequest = {},
): Promise<AnthropicV1MessagesInvocationResult> {
  if (!hasText(input.operation)) {
    return failure("MISSING_OPERATION", "Anthropic v1 messages invocation requires an explicit operation", "input");
  }

  if (!hasText(input.runtime?.runtimeId)) {
    return failure("MISSING_RUNTIME_ID", "Anthropic v1 messages invocation requires runtime.runtimeId", "input");
  }

  const operation = input.operation.trim();
  const runtime = input.runtime;
  const runtimeId = input.runtime.runtimeId.trim();

  if (input.contract?.accepted === false) {
    return failure(
      "CONTRACT_REJECTED",
      input.contract.reason ?? "Anthropic v1 messages contract rejected the request",
      "contract",
    );
  }

  if (input.governance?.accepted === false) {
    return failure(
      "GOVERNANCE_REJECTED",
      input.governance.reason ?? "Anthropic v1 messages governance rejected the request",
      "governance",
    );
  }

  if (input.auth?.present === false) {
    return failure("AUTH_REJECTED", "Anthropic v1 messages auth envelope is marked as unavailable", "auth");
  }

  const requestedScopes = cleanScopes(input.requiredScopes);
  const allowedScopes = cleanScopes(input.allowedScopes);
  const deniedScopes =
    allowedScopes.length === 0 ? [] : requestedScopes.filter((scope) => !allowedScopes.includes(scope));

  if (deniedScopes.length > 0) {
    return failure(
      "SCOPE_DENIED",
      `Anthropic v1 messages invocation requested scopes outside the allowed boundary: ${deniedScopes.join(", ")}`,
      "scope",
    );
  }

  const request: AnthropicV1MessagesRequestEnvelope = {
    provider: "anthropic",
    apiVersion: "v1",
    endpoint: ANTHROPIC_V1_MESSAGES_ENDPOINT,
    operation,
    method: input.method ?? "POST",
    urlPath: buildUrlPath(input.pathSuffix),
    query: cleanQuery(input.query),
    headers: {
      ...cleanHeaders(input.headers),
      ...authHeaderPlan(input.auth),
    },
    body: input.body,
    runtime: {
      runtimeId,
      correlationId: runtime.correlationId?.trim() || "",
      callerId: runtime.callerId?.trim() || "",
    },
    requestedScopes,
    grantedScopes: requestedScopes,
    dryRun: input.dryRun !== false,
    signal: input.signal,
    unsafeSideEffects: false,
    providerFieldsOpaque: true,
  };

  if (request.dryRun) {
    return {
      ok: true,
      request,
      response: {
        provider: "anthropic",
        endpoint: ANTHROPIC_V1_MESSAGES_ENDPOINT,
        mode: input.mockResponse === undefined ? "dry-run" : "mock",
        raw: input.mockResponse ?? null,
        usage: extractAnthropicV1MessagesUsage(input.mockResponse),
        providerFieldsOpaque: true,
      },
      events: ["agentCore.modelAdapter.anthropic.v1.messages.dryRun"],
    };
  }

  if (input.caller === undefined) {
    return failure(
      "CALLER_REQUIRED",
      "Anthropic v1 messages live invocation requires an injected provider caller",
      "provider",
      false,
      request,
    );
  }

  if (input.signal?.aborted === true) {
    return failure(
      "PROVIDER_TIMEOUT",
      "Anthropic v1 messages invocation was aborted before provider call",
      "provider",
      false,
      request,
    );
  }

  try {
    const raw = unwrapProviderCallerBody(await input.caller(request));
    if (input.expectResponseObject === true && !isRecord(raw)) {
      return failure(
        "RESPONSE_FORMAT_DRIFT",
        "Anthropic v1 messages provider response did not match the expected object envelope",
        "provider",
        false,
        request,
      );
    }

    return {
      ok: true,
      request,
      response: {
        provider: "anthropic",
        endpoint: ANTHROPIC_V1_MESSAGES_ENDPOINT,
        mode: "caller",
        raw,
        usage: extractAnthropicV1MessagesUsage(raw),
        providerFieldsOpaque: true,
      },
      events: ["agentCore.modelAdapter.anthropic.v1.messages.called"],
    };
  } catch (error) {
    const code = classifyAnthropicV1MessagesProviderError(error);
    const publicSafeMessage = isRecord(error) && error.publicSafe === true && typeof error.message === "string"
      ? error.message.trim()
      : "";
    return failure(
      code,
      publicSafeMessage.length === 0
        ? `Anthropic v1 messages provider caller failed with ${code}`
        : `Anthropic v1 messages ${publicSafeMessage}`,
      "provider",
      code === "PROVIDER_RATE_LIMITED" || code === "PROVIDER_TIMEOUT" || code === "PROVIDER_UNAVAILABLE",
      request,
    );
  }
}
