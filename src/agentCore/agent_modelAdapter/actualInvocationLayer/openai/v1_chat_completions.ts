/*
 * 文件定位：Agent 模型适配层 / 真实上游调用层 / OpenAI 官方调用面。
 * 核心目的：承接 OpenAI 上游的 v1 chat completions 真实调用面。
 * 能力要求1：需要把对应 endpoint 的请求参数、响应形态、错误形态和能力信号整理成可适配对象。
 * 能力要求2：鉴权/API 登录后续会接入，但这里要为“上游能力变得实际可用”预留位置。
 * 能力要求3：不把该 provider 的字段形状提升为 Praxis 统一语义，只作为 actualInvocationLayer 的现实入口。
 * 边界：只处理上游实际调用面，不在这里定义 agentCore 使用 AI 的统一方式。
 * 对接：需要被 runtime.modelAdapter 拉起，并和 provider/carrier、PromptPack lowering、能力抽象链路接通。
 * 实现提示：先补稳定类型契约、最小可测行为和清晰错误边界，再接入真实执行逻辑。
 */

import type { AuthEnvelope } from "../../authProfileLayer/authEnvelope.js";
import {
  isDeepSeekV4Model,
  mapDeepSeekV4ReasoningEffort,
} from "../../providerAccessLayer/modelMetadataRegistry.js";
import { unwrapProviderCallerBody } from "../../providerAccessLayer/providerCaller.js";

export const OPENAI_V1_CHAT_COMPLETIONS_ENDPOINT = "/v1/chat/completions" as const;

export type OpenAiV1ChatCompletionsMethod = "POST";

export type OpenAiV1ChatCompletionsGate = {
  accepted: boolean;
  reason?: string;
};

export type OpenAiV1ChatCompletionsTrace = {
  correlationId?: string;
  callerId?: string;
};

export type OpenAiV1ChatCompletionsMockCallerRequest = {
  provider: "openai";
  endpoint: typeof OPENAI_V1_CHAT_COMPLETIONS_ENDPOINT;
  url: string;
  method: OpenAiV1ChatCompletionsMethod;
  requestBody: Record<string, unknown>;
  headers: {
    "content-type"?: string;
    authorization?: string;
    organization?: string;
    project?: string;
  };
  timeoutMs: number;
  trace: OpenAiV1ChatCompletionsTrace;
};

export type OpenAiV1ChatCompletionsMockCallerResponse = {
  status: number;
  body?: unknown;
  headers?: Record<string, string>;
};

export type OpenAiV1ChatCompletionsMockCaller = (
  request: OpenAiV1ChatCompletionsMockCallerRequest,
) => Promise<OpenAiV1ChatCompletionsMockCallerResponse> | OpenAiV1ChatCompletionsMockCallerResponse;

export type OpenAiV1ChatCompletionsProviderCaller = (
  request: OpenAiV1ChatCompletionsMockCallerRequest,
) => unknown | Promise<unknown>;

export type OpenAiV1ChatCompletionsInvocationRequest = {
  requestBody?: unknown;
  baseUrl?: string;
  apiKey?: string;
  organizationId?: string;
  projectId?: string;
  auth?: AuthEnvelope;
  timeoutMs?: number;
  trace?: OpenAiV1ChatCompletionsTrace;
  contract?: OpenAiV1ChatCompletionsGate;
  governance?: OpenAiV1ChatCompletionsGate;
  dryRun?: boolean;
  caller?: OpenAiV1ChatCompletionsProviderCaller;
  mockCaller?: OpenAiV1ChatCompletionsMockCaller;
};

export type OpenAiV1ChatCompletionsErrorCode =
  | "MISSING_REQUEST"
  | "MISSING_REQUEST_BODY"
  | "INVALID_REQUEST_BODY"
  | "INVALID_TIMEOUT"
  | "CONTRACT_REJECTED"
  | "GOVERNANCE_REJECTED"
  | "AUTH_REJECTED"
  | "MISSING_CALLER"
  | "MISSING_MOCK_CALLER"
  | "UPSTREAM_AUTH_FAILED"
  | "UPSTREAM_RATE_LIMITED"
  | "UPSTREAM_TIMEOUT"
  | "UPSTREAM_UNAVAILABLE"
  | "UPSTREAM_RESPONSE_DRIFT"
  | "UPSTREAM_ERROR";

export type OpenAiV1ChatCompletionsErrorBoundary = "input" | "contract" | "governance" | "provider";

export type OpenAiV1ChatCompletionsInvocationError = {
  code: OpenAiV1ChatCompletionsErrorCode;
  message: string;
  boundary: OpenAiV1ChatCompletionsErrorBoundary;
  providerSafe: true;
};

export type OpenAiV1ChatCompletionsProviderEnvelope = {
  provider: "openai";
  endpoint: typeof OPENAI_V1_CHAT_COMPLETIONS_ENDPOINT;
  url: string;
  method: OpenAiV1ChatCompletionsMethod;
  requestBody: Record<string, unknown>;
  status?: number;
  rawResponse?: unknown;
  responseHeaders?: Record<string, string>;
  usage?: OpenAiV1ChatCompletionsUsage;
  authState: "missing" | "provided";
  capabilitySignals: {
    actualInvocationLayer: true;
    providerShapePreserved: true;
    endpoint: typeof OPENAI_V1_CHAT_COMPLETIONS_ENDPOINT;
    mockable: true;
  };
  trace: OpenAiV1ChatCompletionsTrace;
  dryRun: boolean;
  unsafeSideEffects: false;
};

export type OpenAiV1ChatCompletionsUsage = {
  source: "openai.chat_completions.usage";
  inputTokens?: number;
  outputTokens?: number;
  totalTokens?: number;
  cachedInputTokens?: number;
  reasoningTokens?: number;
  estimated: false;
};

export type OpenAiV1ChatCompletionsInvocationResult =
  | {
      ok: true;
      envelope: OpenAiV1ChatCompletionsProviderEnvelope;
      events: readonly string[];
    }
  | {
      ok: false;
      error: OpenAiV1ChatCompletionsInvocationError;
      events: readonly string[];
    };

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function failure(
  code: OpenAiV1ChatCompletionsErrorCode,
  message: string,
  boundary: OpenAiV1ChatCompletionsErrorBoundary,
): OpenAiV1ChatCompletionsInvocationResult {
  return {
    ok: false,
    error: { code, message, boundary, providerSafe: true },
    events: ["agentCore.modelAdapter.openai.v1_chat_completions.rejected"],
  };
}

function cleanTrace(trace: OpenAiV1ChatCompletionsTrace | undefined): OpenAiV1ChatCompletionsTrace {
  return {
    correlationId: trace?.correlationId?.trim() || undefined,
    callerId: trace?.callerId?.trim() || undefined,
  };
}

function isV1BaseUrl(baseUrl: string): boolean {
  return /\/v1$/u.test(baseUrl);
}

function endpointUrl(request: OpenAiV1ChatCompletionsInvocationRequest): string {
  const baseUrl = (request.baseUrl?.trim() || "https://api.openai.com").replace(/\/+$/, "");
  return isV1BaseUrl(baseUrl)
    ? `${baseUrl}/chat/completions`
    : `${baseUrl}${OPENAI_V1_CHAT_COMPLETIONS_ENDPOINT}`;
}

function authHeaderPlan(auth: AuthEnvelope | undefined): Readonly<Record<string, string>> {
  if (auth === undefined) return {};
  return Object.fromEntries(auth.headerPlan.map((header) => [header.name.trim().toLowerCase(), String(header.value)]));
}

function requestHeaders(request: OpenAiV1ChatCompletionsInvocationRequest): OpenAiV1ChatCompletionsMockCallerRequest["headers"] {
  const planned = authHeaderPlan(request.auth);
  return {
    "content-type": "application/json",
    authorization: planned.authorization ?? (request.apiKey?.trim() ? `Bearer ${request.apiKey.trim()}` : undefined),
    organization: request.organizationId?.trim() || undefined,
    project: request.projectId?.trim() || undefined,
  };
}

function authProvided(request: OpenAiV1ChatCompletionsInvocationRequest): boolean {
  return request.auth?.present === true || Boolean(request.apiKey?.trim());
}

function readFiniteNumber(record: Readonly<Record<string, unknown>> | undefined, keys: readonly string[]): number | undefined {
  if (record === undefined) return undefined;
  for (const key of keys) {
    const value = record[key];
    if (typeof value === "number" && Number.isFinite(value)) return value;
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

function usageFromRaw(raw: unknown): OpenAiV1ChatCompletionsUsage | undefined {
  if (typeof raw === "string") {
    let streamedUsage: OpenAiV1ChatCompletionsUsage | undefined;
    for (const object of sseDataObjects(raw)) {
      const usage = usageFromRaw(object);
      if (usage !== undefined) streamedUsage = usage;
    }
    return streamedUsage;
  }
  if (!isRecord(raw)) return undefined;
  const usage = isRecord(raw.usage) ? raw.usage : undefined;
  if (usage === undefined) return undefined;
  const inputDetails = isRecord(usage.prompt_tokens_details)
    ? usage.prompt_tokens_details
    : isRecord(usage.promptTokensDetails)
      ? usage.promptTokensDetails
      : isRecord(usage.input_tokens_details)
        ? usage.input_tokens_details
        : isRecord(usage.inputTokensDetails)
          ? usage.inputTokensDetails
          : undefined;
  const outputDetails = isRecord(usage.completion_tokens_details)
    ? usage.completion_tokens_details
    : isRecord(usage.completionTokensDetails)
      ? usage.completionTokensDetails
      : isRecord(usage.output_tokens_details)
        ? usage.output_tokens_details
        : isRecord(usage.outputTokensDetails)
          ? usage.outputTokensDetails
          : undefined;
  const inputTokens = readFiniteNumber(usage, ["prompt_tokens", "input_tokens", "promptTokens", "inputTokens"]);
  const outputTokens = readFiniteNumber(usage, ["completion_tokens", "output_tokens", "completionTokens", "outputTokens"]);
  const totalTokens = readFiniteNumber(usage, ["total_tokens", "totalTokens"]);
  const reasoningTokens = readFiniteNumber(outputDetails, ["reasoning_tokens", "reasoningTokens"])
    ?? readFiniteNumber(usage, ["reasoning_tokens", "thinking_tokens", "reasoningTokens", "thinkingTokens"]);
  const promptCacheHitTokens = readFiniteNumber(usage, [
    "prompt_cache_hit_tokens",
    "promptCacheHitTokens",
    "cache_hit_tokens",
    "cacheHitTokens",
  ]);
  const promptCacheMissTokens = readFiniteNumber(usage, [
    "prompt_cache_miss_tokens",
    "promptCacheMissTokens",
    "cache_miss_tokens",
    "cacheMissTokens",
  ]);
  const cachedInputTokens = readFiniteNumber(inputDetails, ["cached_tokens", "cachedTokens"])
    ?? promptCacheHitTokens
    ?? (
      inputTokens !== undefined && promptCacheMissTokens !== undefined
        ? Math.max(0, inputTokens - promptCacheMissTokens)
        : undefined
    );
  if (
    inputTokens === undefined
    && outputTokens === undefined
    && totalTokens === undefined
    && cachedInputTokens === undefined
    && reasoningTokens === undefined
  ) return undefined;
  return {
    source: "openai.chat_completions.usage",
    inputTokens,
    outputTokens,
    totalTokens,
    cachedInputTokens,
    reasoningTokens,
    estimated: false,
  };
}

function applyChatCompletionsCompatibility(requestBody: Record<string, unknown>): Record<string, unknown> {
  const model = typeof requestBody.model === "string" ? requestBody.model : undefined;
  if (!isDeepSeekV4Model(model)) {
    return requestBody;
  }
  const reasoningEffort = typeof requestBody.reasoning_effort === "string"
    ? requestBody.reasoning_effort
    : undefined;
  const plan = mapDeepSeekV4ReasoningEffort(reasoningEffort);
  if (plan === undefined) {
    return requestBody;
  }
  const normalized: Record<string, unknown> = {
    ...requestBody,
    thinking: plan.thinking,
  };
  if (plan.reasoningEffort === undefined) {
    delete normalized.reasoning_effort;
  } else {
    normalized.reasoning_effort = plan.reasoningEffort;
  }
  return normalized;
}

function toEnvelope(
  request: OpenAiV1ChatCompletionsInvocationRequest,
  requestBody: Record<string, unknown>,
  response?: OpenAiV1ChatCompletionsMockCallerResponse,
): OpenAiV1ChatCompletionsProviderEnvelope {
  return {
    provider: "openai",
    endpoint: OPENAI_V1_CHAT_COMPLETIONS_ENDPOINT,
    url: endpointUrl(request),
    method: "POST",
    requestBody,
    status: response?.status,
    rawResponse: response?.body,
    responseHeaders: response?.headers,
    usage: usageFromRaw(response?.body),
    authState: authProvided(request) ? "provided" : "missing",
    capabilitySignals: {
      actualInvocationLayer: true,
      providerShapePreserved: true,
      endpoint: OPENAI_V1_CHAT_COMPLETIONS_ENDPOINT,
      mockable: true,
    },
    trace: cleanTrace(request.trace),
    dryRun: request.dryRun !== false,
    unsafeSideEffects: false,
  };
}

function classifyStatus(
  response: OpenAiV1ChatCompletionsMockCallerResponse,
): OpenAiV1ChatCompletionsInvocationError | undefined {
  if (response.status === 401 || response.status === 403) {
    return {
      code: "UPSTREAM_AUTH_FAILED",
      message: "OpenAI v1 chat completions mock caller reported an authentication failure",
      boundary: "provider",
      providerSafe: true,
    };
  }

  if (response.status === 429) {
    return {
      code: "UPSTREAM_RATE_LIMITED",
      message: "OpenAI v1 chat completions mock caller reported rate limiting",
      boundary: "provider",
      providerSafe: true,
    };
  }

  if (response.status === 408 || response.status === 504) {
    return {
      code: "UPSTREAM_TIMEOUT",
      message: "OpenAI v1 chat completions mock caller reported a timeout",
      boundary: "provider",
      providerSafe: true,
    };
  }

  if (response.status >= 500) {
    return {
      code: "UPSTREAM_UNAVAILABLE",
      message: "OpenAI v1 chat completions mock caller reported provider unavailability",
      boundary: "provider",
      providerSafe: true,
    };
  }

  if (response.status >= 400) {
    return {
      code: "UPSTREAM_ERROR",
      message: "OpenAI v1 chat completions mock caller reported an upstream error",
      boundary: "provider",
      providerSafe: true,
    };
  }

  if (response.body === undefined || response.body === null) {
    return {
      code: "UPSTREAM_RESPONSE_DRIFT",
      message: "OpenAI v1 chat completions mock caller returned an empty provider response",
      boundary: "provider",
      providerSafe: true,
    };
  }

  return undefined;
}

function classifyThrown(error: unknown): OpenAiV1ChatCompletionsInvocationError {
  const maybeError = error as { name?: unknown; code?: unknown; message?: unknown };
  const name = typeof maybeError.name === "string" ? maybeError.name : "";
  const code = typeof maybeError.code === "string" ? maybeError.code : "";
  const message = typeof maybeError.message === "string" ? maybeError.message : "mock caller failed";
  const timedOut = name === "AbortError" || code === "ETIMEDOUT" || code === "TIMEOUT";

  return {
    code: timedOut ? "UPSTREAM_TIMEOUT" : "UPSTREAM_ERROR",
    message: timedOut ? "OpenAI v1 chat completions mock caller timed out" : message,
    boundary: "provider",
    providerSafe: true,
  };
}

export async function invokeOpenAiV1ChatCompletions(
  request?: OpenAiV1ChatCompletionsInvocationRequest,
): Promise<OpenAiV1ChatCompletionsInvocationResult> {
  if (request === undefined) {
    return failure(
      "MISSING_REQUEST",
      "OpenAI v1 chat completions invocation requires an explicit request envelope",
      "input",
    );
  }

  if (request.requestBody === undefined) {
    return failure(
      "MISSING_REQUEST_BODY",
      "OpenAI v1 chat completions invocation requires a provider request body",
      "input",
    );
  }

  if (!isRecord(request.requestBody)) {
    return failure("INVALID_REQUEST_BODY", "OpenAI v1 chat completions requestBody must be a JSON object envelope", "input");
  }

  const requestBody = applyChatCompletionsCompatibility(request.requestBody);

  if (request.timeoutMs !== undefined && request.timeoutMs <= 0) {
    return failure("INVALID_TIMEOUT", "OpenAI v1 chat completions timeoutMs must be greater than zero", "input");
  }

  if (request.contract?.accepted === false) {
    return failure(
      "CONTRACT_REJECTED",
      request.contract.reason ?? "OpenAI v1 chat completions contract gate rejected the call",
      "contract",
    );
  }

  if (request.governance?.accepted === false) {
    return failure(
      "GOVERNANCE_REJECTED",
      request.governance.reason ?? "OpenAI v1 chat completions governance gate rejected the call",
      "governance",
    );
  }

  if (request.dryRun !== false) {
    return {
      ok: true,
      envelope: toEnvelope(request, requestBody),
      events: ["agentCore.modelAdapter.openai.v1_chat_completions.dryRunPlanned"],
    };
  }

  if (request.caller !== undefined) {
    if (request.governance?.accepted !== true) {
      return failure(
        "GOVERNANCE_REJECTED",
        "OpenAI v1 chat completions live caller requires affirmative runtime governance",
        "governance",
      );
    }

    if (request.auth !== undefined && request.auth.present !== true) {
      return failure("AUTH_REJECTED", "OpenAI v1 chat completions auth envelope is marked as unavailable", "provider");
    }

    const callerRequest: OpenAiV1ChatCompletionsMockCallerRequest = {
      provider: "openai",
      endpoint: OPENAI_V1_CHAT_COMPLETIONS_ENDPOINT,
      url: endpointUrl(request),
      method: "POST",
      requestBody,
      headers: requestHeaders(request),
      timeoutMs: request.timeoutMs ?? 30_000,
      trace: cleanTrace(request.trace),
    };

    try {
      const providerEnvelope = await request.caller(callerRequest);
      const raw = unwrapProviderCallerBody(providerEnvelope);
      if (raw === undefined || raw === null) {
        return failure(
          "UPSTREAM_RESPONSE_DRIFT",
          "OpenAI v1 chat completions caller returned an empty provider response",
          "provider",
        );
      }
      return {
        ok: true,
        envelope: {
          ...toEnvelope(request, requestBody),
          requestBody,
          rawResponse: raw,
          usage: usageFromRaw(raw),
          dryRun: false,
        },
        events: ["agentCore.modelAdapter.openai.v1_chat_completions.providerResponseReceived"],
      };
    } catch (error) {
      return {
        ok: false,
        error: classifyThrown(error),
        events: ["agentCore.modelAdapter.openai.v1_chat_completions.providerRejected"],
      };
    }
  }

  if (request.mockCaller === undefined) {
    return failure(
      "MISSING_MOCK_CALLER",
      "OpenAI v1 chat completions first implementation only executes through mockCaller",
      "provider",
    );
  }

  const callerRequest: OpenAiV1ChatCompletionsMockCallerRequest = {
    provider: "openai",
    endpoint: OPENAI_V1_CHAT_COMPLETIONS_ENDPOINT,
    url: endpointUrl(request),
    method: "POST",
    requestBody,
    headers: requestHeaders(request),
    timeoutMs: request.timeoutMs ?? 30_000,
    trace: cleanTrace(request.trace),
  };

  try {
    const response = await request.mockCaller(callerRequest);
    const classified = classifyStatus(response);
    if (classified !== undefined) {
      return {
        ok: false,
        error: classified,
        events: ["agentCore.modelAdapter.openai.v1_chat_completions.providerRejected"],
      };
    }

    return {
      ok: true,
      envelope: toEnvelope(request, requestBody, response),
      events: ["agentCore.modelAdapter.openai.v1_chat_completions.mockResponseReceived"],
    };
  } catch (error) {
    return {
      ok: false,
      error: classifyThrown(error),
      events: ["agentCore.modelAdapter.openai.v1_chat_completions.providerRejected"],
    };
  }
}
