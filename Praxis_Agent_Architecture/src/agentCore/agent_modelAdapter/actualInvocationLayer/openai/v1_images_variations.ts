/*
 * 文件定位：Agent 模型适配层 / 真实上游调用层 / OpenAI 官方调用面。
 * 核心目的：承接 OpenAI 上游的 v1 images variations 真实调用面。
 * 能力要求1：需要把对应 endpoint 的请求参数、响应形态、错误形态和能力信号整理成可适配对象。
 * 能力要求2：鉴权/API 登录后续会接入，但这里要为“上游能力变得实际可用”预留位置。
 * 能力要求3：不把该 provider 的字段形状提升为 Praxis 统一语义，只作为 actualInvocationLayer 的现实入口。
 * 边界：只处理上游实际调用面，不在这里定义 agentCore 使用 AI 的统一方式。
 * 对接：需要被 runtime.modelAdapter 拉起，并和 provider/carrier、PromptPack lowering、能力抽象链路接通。
 * 实现提示：先补稳定类型契约、最小可测行为和清晰错误边界，再接入真实执行逻辑。
 */

export const OPENAI_V1_IMAGES_VARIATIONS_ENDPOINT = "/v1/images/variations" as const;
export const DEFAULT_OPENAI_V1_IMAGES_VARIATIONS_BASE_URL = "https://api.openai.com" as const;

export type OpenAIV1ImagesVariationsBoundary =
  | "input"
  | "contract"
  | "governance"
  | "auth"
  | "scope"
  | "provider"
  | "response";

export type OpenAIV1ImagesVariationsErrorCode =
  | "MISSING_IMAGE"
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

export type OpenAIV1ImagesVariationsGate = {
  accepted: boolean;
  reason?: string;
};

export type OpenAIV1ImagesVariationsRuntimeContext = {
  runtimeId?: string;
  invocationId?: string;
  traceId?: string;
  callerId?: string;
};

export type OpenAIV1ImagesVariationsAuthEnvelope = {
  kind: "bearer" | "api-key" | "none";
  present: boolean;
  redactedToken?: string;
};

export type OpenAIV1ImagesVariationInput = {
  id?: string;
  name?: string;
  mimeType?: string;
  byteLength?: number;
  sourceRef?: string;
  providerHandle?: unknown;
};

export type OpenAIV1ImagesVariationsRequestEnvelope = {
  provider: "openai";
  apiVersion: "v1";
  endpoint: typeof OPENAI_V1_IMAGES_VARIATIONS_ENDPOINT;
  operation: "create-image-variation";
  method: "POST";
  url: string;
  headers: Readonly<Record<string, string>>;
  body?: unknown;
  image: OpenAIV1ImagesVariationInput;
  runtime: Required<OpenAIV1ImagesVariationsRuntimeContext>;
  requestedScopes: readonly string[];
  grantedScopes: readonly string[];
  dryRun: boolean;
  providerCallPlanned: boolean;
  unsafeSideEffects: false;
  providerFieldsOpaque: true;
};

export type OpenAIV1ImagesVariationsProviderCaller = (
  envelope: OpenAIV1ImagesVariationsRequestEnvelope,
) => unknown | Promise<unknown>;

export type OpenAIV1ImagesVariationsInvocationRequest = {
  image?: OpenAIV1ImagesVariationInput;
  body?: unknown;
  baseUrl?: string;
  headers?: Readonly<Record<string, string | undefined>>;
  auth?: OpenAIV1ImagesVariationsAuthEnvelope;
  runtime?: OpenAIV1ImagesVariationsRuntimeContext;
  requiredScopes?: readonly string[];
  allowedScopes?: readonly string[];
  contract?: OpenAIV1ImagesVariationsGate;
  governance?: OpenAIV1ImagesVariationsGate;
  dryRun?: boolean;
  mockResponse?: unknown;
  expectImageListResponse?: boolean;
  caller?: OpenAIV1ImagesVariationsProviderCaller;
};

export type OpenAIV1ImagesVariationsResponseEnvelope = {
  provider: "openai";
  endpoint: typeof OPENAI_V1_IMAGES_VARIATIONS_ENDPOINT;
  mode: "dry-run" | "mock" | "caller";
  raw: unknown;
  providerFieldsOpaque: true;
};

export type OpenAIV1ImagesVariationsCapabilitySignal = {
  provider: "openai";
  endpoint: typeof OPENAI_V1_IMAGES_VARIATIONS_ENDPOINT;
  operation: "create-image-variation";
  rawShape: "image-list" | "mock" | "dry-run";
};

export type OpenAIV1ImagesVariationsError = {
  code: OpenAIV1ImagesVariationsErrorCode;
  message: string;
  boundary: OpenAIV1ImagesVariationsBoundary;
  retryable: boolean;
};

export type OpenAIV1ImagesVariationsResult =
  | {
      ok: true;
      request: OpenAIV1ImagesVariationsRequestEnvelope;
      response: OpenAIV1ImagesVariationsResponseEnvelope;
      capability: OpenAIV1ImagesVariationsCapabilitySignal;
      events: readonly string[];
    }
  | {
      ok: false;
      error: OpenAIV1ImagesVariationsError;
      request?: OpenAIV1ImagesVariationsRequestEnvelope;
      events: readonly string[];
    };

function hasText(value: string | undefined): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isImageInput(value: unknown): value is OpenAIV1ImagesVariationInput {
  return isRecord(value);
}

function cleanScopes(scopes: readonly string[] | undefined): readonly string[] {
  return [...new Set((scopes ?? []).map((scope) => scope.trim()).filter(Boolean))];
}

function cleanHeaders(
  headers: OpenAIV1ImagesVariationsInvocationRequest["headers"],
): Readonly<Record<string, string>> {
  return Object.fromEntries(
    Object.entries(headers ?? {})
      .filter((entry): entry is [string, string] => typeof entry[1] === "string" && entry[1].trim().length > 0)
      .map(([key, value]) => [key.trim().toLowerCase(), value.trim()]),
  );
}

function normalizeBaseUrl(baseUrl: string | undefined): string {
  return hasText(baseUrl) ? baseUrl.trim().replace(/\/+$/, "") : DEFAULT_OPENAI_V1_IMAGES_VARIATIONS_BASE_URL;
}

function failure(
  code: OpenAIV1ImagesVariationsErrorCode,
  message: string,
  boundary: OpenAIV1ImagesVariationsBoundary,
  retryable = false,
  request?: OpenAIV1ImagesVariationsRequestEnvelope,
): OpenAIV1ImagesVariationsResult {
  return {
    ok: false,
    error: { code, message, boundary, retryable },
    request,
    events: ["agentCore.modelAdapter.openai.v1.images.variations.rejected"],
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

export function classifyOpenAIV1ImagesVariationsProviderError(
  error: unknown,
): OpenAIV1ImagesVariationsErrorCode {
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

export async function invokeOpenAIV1ImagesVariations(
  input: OpenAIV1ImagesVariationsInvocationRequest = {},
): Promise<OpenAIV1ImagesVariationsResult> {
  if (!isImageInput(input.image)) {
    return failure(
      "MISSING_IMAGE",
      "OpenAI v1 images variations invocation requires an image handle",
      "input",
    );
  }

  const runtime = input.runtime;
  if (runtime === undefined || !hasText(runtime.runtimeId)) {
    return failure(
      "MISSING_RUNTIME_ID",
      "OpenAI v1 images variations invocation requires runtime.runtimeId",
      "input",
    );
  }

  if (input.contract?.accepted === false) {
    return failure(
      "CONTRACT_REJECTED",
      input.contract.reason ?? "OpenAI v1 images variations contract rejected the request",
      "contract",
    );
  }

  if (input.governance?.accepted === false) {
    return failure(
      "GOVERNANCE_REJECTED",
      input.governance.reason ?? "OpenAI v1 images variations governance rejected the request",
      "governance",
    );
  }

  if (input.auth?.present === false) {
    return failure("AUTH_REJECTED", "OpenAI v1 images variations auth envelope is unavailable", "auth");
  }

  const requestedScopes = cleanScopes(input.requiredScopes);
  const allowedScopes = cleanScopes(input.allowedScopes);
  const deniedScopes =
    allowedScopes.length === 0 ? [] : requestedScopes.filter((scope) => !allowedScopes.includes(scope));

  if (deniedScopes.length > 0) {
    return failure(
      "SCOPE_DENIED",
      `OpenAI v1 images variations requested scopes outside the allowed boundary: ${deniedScopes.join(", ")}`,
      "scope",
    );
  }

  const request: OpenAIV1ImagesVariationsRequestEnvelope = {
    provider: "openai",
    apiVersion: "v1",
    endpoint: OPENAI_V1_IMAGES_VARIATIONS_ENDPOINT,
    operation: "create-image-variation",
    method: "POST",
    url: `${normalizeBaseUrl(input.baseUrl)}${OPENAI_V1_IMAGES_VARIATIONS_ENDPOINT}`,
    headers: cleanHeaders(input.headers),
    body: input.body,
    image: input.image,
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
        provider: "openai",
        endpoint: OPENAI_V1_IMAGES_VARIATIONS_ENDPOINT,
        mode: input.mockResponse === undefined ? "dry-run" : "mock",
        raw: input.mockResponse ?? null,
        providerFieldsOpaque: true,
      },
      capability: {
        provider: "openai",
        endpoint: OPENAI_V1_IMAGES_VARIATIONS_ENDPOINT,
        operation: "create-image-variation",
        rawShape: input.mockResponse === undefined ? "dry-run" : "mock",
      },
      events: ["agentCore.modelAdapter.openai.v1.images.variations.dryRun"],
    };
  }

  if (input.caller === undefined) {
    return failure(
      "CALLER_REQUIRED",
      "OpenAI v1 images variations live invocation requires an injected provider caller",
      "provider",
      false,
      request,
    );
  }

  try {
    const raw = await input.caller(request);
    if (input.expectImageListResponse === true && !isImageListResponse(raw)) {
      return failure(
        "RESPONSE_FORMAT_DRIFT",
        "OpenAI v1 images variations response did not match the expected image list envelope",
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
        endpoint: OPENAI_V1_IMAGES_VARIATIONS_ENDPOINT,
        mode: "caller",
        raw,
        providerFieldsOpaque: true,
      },
      capability: {
        provider: "openai",
        endpoint: OPENAI_V1_IMAGES_VARIATIONS_ENDPOINT,
        operation: "create-image-variation",
        rawShape: "image-list",
      },
      events: ["agentCore.modelAdapter.openai.v1.images.variations.called"],
    };
  } catch (error) {
    const code = classifyOpenAIV1ImagesVariationsProviderError(error);
    return failure(
      code,
      `OpenAI v1 images variations provider caller failed with ${code}`,
      code === "RESPONSE_FORMAT_DRIFT" ? "response" : "provider",
      code === "PROVIDER_RATE_LIMITED" || code === "PROVIDER_TIMEOUT" || code === "PROVIDER_UNAVAILABLE",
      request,
    );
  }
}
