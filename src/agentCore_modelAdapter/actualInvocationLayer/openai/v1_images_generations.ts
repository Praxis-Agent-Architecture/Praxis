/*
 * 文件定位：Agent 模型适配层 / 真实上游调用层 / OpenAI 官方调用面。
 * 核心目的：承接 OpenAI 上游的 v1 images generations 真实调用面。
 * 能力要求1：需要把对应 endpoint 的请求参数、响应形态、错误形态和能力信号整理成可适配对象。
 * 能力要求2：鉴权/API 登录后续会接入，但这里要为“上游能力变得实际可用”预留位置。
 * 能力要求3：不把该 provider 的字段形状提升为 Praxis 统一语义，只作为 actualInvocationLayer 的现实入口。
 * 边界：只处理上游实际调用面，不在这里定义 agentCore 使用 AI 的统一方式。
 * 对接：需要被 runtime.modelAdapter 拉起，并和 provider/carrier、PromptPack lowering、能力抽象链路接通。
 * 实现提示：先补稳定类型契约、最小可测行为和清晰错误边界，再接入真实执行逻辑。
 */

import type { AuthEnvelope } from "../../authProfileLayer/authEnvelope.js";
import { unwrapProviderCallerBody } from "../../providerAccessLayer/providerCaller.js";

export const OPENAI_V1_IMAGES_GENERATIONS_ENDPOINT = "/v1/images/generations" as const;
export const DEFAULT_OPENAI_V1_IMAGES_GENERATIONS_BASE_URL = "https://api.openai.com" as const;

export type OpenAIV1ImagesGenerationsBoundary =
  | "input"
  | "contract"
  | "governance"
  | "auth"
  | "scope"
  | "provider"
  | "response";

export type OpenAIV1ImagesGenerationsErrorCode =
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

export type OpenAIV1ImagesGenerationsGate = {
  accepted: boolean;
  reason?: string;
};

export type OpenAIV1ImagesGenerationsRuntimeContext = {
  runtimeId?: string;
  invocationId?: string;
  traceId?: string;
  callerId?: string;
};

export type OpenAIV1ImagesGenerationsAuthEnvelope = {
  kind: "bearer" | "api-key" | "none";
  present: boolean;
  redactedToken?: string;
};

export type OpenAIV1ImagesGenerationsRequestEnvelope = {
  provider: "openai";
  apiVersion: "v1";
  endpoint: typeof OPENAI_V1_IMAGES_GENERATIONS_ENDPOINT;
  operation: "create-image";
  method: "POST";
  url: string;
  headers: Readonly<Record<string, string>>;
  body: unknown;
  runtime: Required<OpenAIV1ImagesGenerationsRuntimeContext>;
  requestedScopes: readonly string[];
  grantedScopes: readonly string[];
  dryRun: boolean;
  providerCallPlanned: boolean;
  unsafeSideEffects: false;
  providerFieldsOpaque: true;
};

export type OpenAIV1ImagesGenerationsProviderCaller = (
  envelope: OpenAIV1ImagesGenerationsRequestEnvelope,
) => unknown | Promise<unknown>;

export type OpenAIV1ImagesGenerationsInvocationRequest = {
  body?: unknown;
  baseUrl?: string;
  headers?: Readonly<Record<string, string | undefined>>;
  auth?: OpenAIV1ImagesGenerationsAuthEnvelope | AuthEnvelope;
  runtime?: OpenAIV1ImagesGenerationsRuntimeContext;
  requiredScopes?: readonly string[];
  allowedScopes?: readonly string[];
  contract?: OpenAIV1ImagesGenerationsGate;
  governance?: OpenAIV1ImagesGenerationsGate;
  dryRun?: boolean;
  mockResponse?: unknown;
  expectImageListResponse?: boolean;
  caller?: OpenAIV1ImagesGenerationsProviderCaller;
};

export type OpenAIV1ImagesGenerationsResponseEnvelope = {
  provider: "openai";
  endpoint: typeof OPENAI_V1_IMAGES_GENERATIONS_ENDPOINT;
  mode: "dry-run" | "mock" | "caller";
  raw: unknown;
  providerFieldsOpaque: true;
};

export type OpenAIV1ImagesGenerationsCapabilitySignal = {
  provider: "openai";
  endpoint: typeof OPENAI_V1_IMAGES_GENERATIONS_ENDPOINT;
  operation: "create-image";
  rawShape: "image-list" | "mock" | "dry-run";
};

export type OpenAIV1ImagesGenerationsError = {
  code: OpenAIV1ImagesGenerationsErrorCode;
  message: string;
  boundary: OpenAIV1ImagesGenerationsBoundary;
  retryable: boolean;
};

export type OpenAIV1ImagesGenerationsResult =
  | {
      ok: true;
      request: OpenAIV1ImagesGenerationsRequestEnvelope;
      response: OpenAIV1ImagesGenerationsResponseEnvelope;
      capability: OpenAIV1ImagesGenerationsCapabilitySignal;
      events: readonly string[];
    }
  | {
      ok: false;
      error: OpenAIV1ImagesGenerationsError;
      request?: OpenAIV1ImagesGenerationsRequestEnvelope;
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
  headers: OpenAIV1ImagesGenerationsInvocationRequest["headers"],
): Readonly<Record<string, string>> {
  return Object.fromEntries(
    Object.entries(headers ?? {})
      .filter((entry): entry is [string, string] => typeof entry[1] === "string" && entry[1].trim().length > 0)
      .map(([key, value]) => [key.trim().toLowerCase(), value.trim()]),
  );
}

function authHeaderPlan(auth: OpenAIV1ImagesGenerationsInvocationRequest["auth"]): Readonly<Record<string, string>> {
  if (auth === undefined || !("headerPlan" in auth)) {
    return {};
  }

  return Object.fromEntries(auth.headerPlan.map((header) => [header.name.trim().toLowerCase(), String(header.value)]));
}

function normalizeBaseUrl(baseUrl: string | undefined): string {
  return hasText(baseUrl) ? baseUrl.trim().replace(/\/+$/, "") : DEFAULT_OPENAI_V1_IMAGES_GENERATIONS_BASE_URL;
}

function failure(
  code: OpenAIV1ImagesGenerationsErrorCode,
  message: string,
  boundary: OpenAIV1ImagesGenerationsBoundary,
  retryable = false,
  request?: OpenAIV1ImagesGenerationsRequestEnvelope,
): OpenAIV1ImagesGenerationsResult {
  return {
    ok: false,
    error: { code, message, boundary, retryable },
    request,
    events: ["agentCore.modelAdapter.openai.v1.images.generations.rejected"],
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

function isImageListResponse(raw: unknown): boolean {
  return isRecord(raw) && Array.isArray(raw.data);
}

export function classifyOpenAIV1ImagesGenerationsProviderError(
  error: unknown,
): OpenAIV1ImagesGenerationsErrorCode {
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

export async function invokeOpenAIV1ImagesGenerations(
  input: OpenAIV1ImagesGenerationsInvocationRequest = {},
): Promise<OpenAIV1ImagesGenerationsResult> {
  if (input.body === undefined) {
    return failure(
      "MISSING_BODY",
      "OpenAI v1 images generations invocation requires an opaque provider body",
      "input",
    );
  }

  const runtime = input.runtime;
  if (runtime === undefined || !hasText(runtime.runtimeId)) {
    return failure("MISSING_RUNTIME_ID", "OpenAI v1 images generations invocation requires runtime.runtimeId", "input");
  }

  if (input.contract?.accepted === false) {
    return failure(
      "CONTRACT_REJECTED",
      input.contract.reason ?? "OpenAI v1 images generations contract rejected the request",
      "contract",
    );
  }

  if (input.governance?.accepted === false) {
    return failure(
      "GOVERNANCE_REJECTED",
      input.governance.reason ?? "OpenAI v1 images generations governance rejected the request",
      "governance",
    );
  }

  const liveMode = input.dryRun === false;
  if (liveMode && input.governance?.accepted !== true) {
    return failure(
      "GOVERNANCE_REJECTED",
      "OpenAI v1 images generations live invocation requires affirmative runtime governance",
      "governance",
    );
  }

  if (liveMode && input.auth?.present !== true) {
    return failure("AUTH_REJECTED", "OpenAI v1 images generations auth envelope is unavailable", "auth");
  }

  const requestedScopes = cleanScopes(input.requiredScopes);
  const allowedScopes = cleanScopes(input.allowedScopes);
  const deniedScopes =
    allowedScopes.length === 0 ? [] : requestedScopes.filter((scope) => !allowedScopes.includes(scope));

  if (deniedScopes.length > 0) {
    return failure(
      "SCOPE_DENIED",
      `OpenAI v1 images generations requested scopes outside the allowed boundary: ${deniedScopes.join(", ")}`,
      "scope",
    );
  }

  const request: OpenAIV1ImagesGenerationsRequestEnvelope = {
    provider: "openai",
    apiVersion: "v1",
    endpoint: OPENAI_V1_IMAGES_GENERATIONS_ENDPOINT,
    operation: "create-image",
    method: "POST",
    url: `${normalizeBaseUrl(input.baseUrl)}${OPENAI_V1_IMAGES_GENERATIONS_ENDPOINT}`,
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
        endpoint: OPENAI_V1_IMAGES_GENERATIONS_ENDPOINT,
        mode: input.mockResponse === undefined ? "dry-run" : "mock",
        raw: input.mockResponse ?? null,
        providerFieldsOpaque: true,
      },
      capability: {
        provider: "openai",
        endpoint: OPENAI_V1_IMAGES_GENERATIONS_ENDPOINT,
        operation: "create-image",
        rawShape: input.mockResponse === undefined ? "dry-run" : "mock",
      },
      events: ["agentCore.modelAdapter.openai.v1.images.generations.dryRun"],
    };
  }

  if (input.caller === undefined) {
    return failure(
      "CALLER_REQUIRED",
      "OpenAI v1 images generations live invocation requires an injected provider caller",
      "provider",
      false,
      request,
    );
  }

  try {
    const raw = unwrapProviderCallerBody(await input.caller(request));
    if (input.expectImageListResponse === true && !isImageListResponse(raw)) {
      return failure(
        "RESPONSE_FORMAT_DRIFT",
        "OpenAI v1 images generations response did not match the expected image list envelope",
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
        endpoint: OPENAI_V1_IMAGES_GENERATIONS_ENDPOINT,
        mode: "caller",
        raw,
        providerFieldsOpaque: true,
      },
      capability: {
        provider: "openai",
        endpoint: OPENAI_V1_IMAGES_GENERATIONS_ENDPOINT,
        operation: "create-image",
        rawShape: "image-list",
      },
      events: ["agentCore.modelAdapter.openai.v1.images.generations.called"],
    };
  } catch (error) {
    const code = classifyOpenAIV1ImagesGenerationsProviderError(error);
    return failure(
      code,
      `OpenAI v1 images generations provider caller failed with ${code}`,
      code === "RESPONSE_FORMAT_DRIFT" ? "response" : "provider",
      code === "PROVIDER_RATE_LIMITED" || code === "PROVIDER_TIMEOUT" || code === "PROVIDER_UNAVAILABLE",
      request,
    );
  }
}
