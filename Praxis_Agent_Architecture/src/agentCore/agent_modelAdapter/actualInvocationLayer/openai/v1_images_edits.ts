/*
 * 文件定位：Agent 模型适配层 / 真实上游调用层 / OpenAI 官方调用面。
 * 核心目的：承接 OpenAI 上游的 v1 images edits 真实调用面。
 * 能力要求1：需要把对应 endpoint 的请求参数、响应形态、错误形态和能力信号整理成可适配对象。
 * 能力要求2：鉴权/API 登录后续会接入，但这里要为“上游能力变得实际可用”预留位置。
 * 能力要求3：不把该 provider 的字段形状提升为 Praxis 统一语义，只作为 actualInvocationLayer 的现实入口。
 * 边界：只处理上游实际调用面，不在这里定义 agentCore 使用 AI 的统一方式。
 * 对接：需要被 runtime.modelAdapter 拉起，并和 provider/carrier、PromptPack lowering、能力抽象链路接通。
 * 实现提示：先补稳定类型契约、最小可测行为和清晰错误边界，再接入真实执行逻辑。
 */

export const OPENAI_V1_IMAGES_EDITS_ENDPOINT = "/v1/images/edits" as const;
export const DEFAULT_OPENAI_V1_IMAGES_EDITS_BASE_URL = "https://api.openai.com" as const;

export type OpenAIV1ImagesEditsBoundary =
  | "input"
  | "contract"
  | "governance"
  | "auth"
  | "scope"
  | "provider"
  | "response";

export type OpenAIV1ImagesEditsErrorCode =
  | "MISSING_BODY"
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

export type OpenAIV1ImagesEditsGate = {
  accepted: boolean;
  reason?: string;
};

export type OpenAIV1ImagesEditsRuntimeContext = {
  runtimeId?: string;
  invocationId?: string;
  traceId?: string;
  callerId?: string;
};

export type OpenAIV1ImagesEditsAuthEnvelope = {
  kind: "bearer" | "api-key" | "none";
  present: boolean;
  redactedToken?: string;
};

export type OpenAIV1ImagesEditInput = {
  id?: string;
  name?: string;
  mimeType?: string;
  byteLength?: number;
  sourceRef?: string;
  providerHandle?: unknown;
};

export type OpenAIV1ImagesEditsRequestEnvelope = {
  provider: "openai";
  apiVersion: "v1";
  endpoint: typeof OPENAI_V1_IMAGES_EDITS_ENDPOINT;
  operation: "edit-image";
  method: "POST";
  url: string;
  headers: Readonly<Record<string, string>>;
  body: unknown;
  images: readonly OpenAIV1ImagesEditInput[];
  mask?: OpenAIV1ImagesEditInput;
  runtime: Required<OpenAIV1ImagesEditsRuntimeContext>;
  requestedScopes: readonly string[];
  grantedScopes: readonly string[];
  dryRun: boolean;
  providerCallPlanned: boolean;
  unsafeSideEffects: false;
  providerFieldsOpaque: true;
};

export type OpenAIV1ImagesEditsProviderCaller = (
  envelope: OpenAIV1ImagesEditsRequestEnvelope,
) => unknown | Promise<unknown>;

export type OpenAIV1ImagesEditsInvocationRequest = {
  body?: unknown;
  images?: readonly OpenAIV1ImagesEditInput[];
  mask?: OpenAIV1ImagesEditInput;
  baseUrl?: string;
  headers?: Readonly<Record<string, string | undefined>>;
  auth?: OpenAIV1ImagesEditsAuthEnvelope;
  runtime?: OpenAIV1ImagesEditsRuntimeContext;
  requiredScopes?: readonly string[];
  allowedScopes?: readonly string[];
  contract?: OpenAIV1ImagesEditsGate;
  governance?: OpenAIV1ImagesEditsGate;
  dryRun?: boolean;
  mockResponse?: unknown;
  expectImageListResponse?: boolean;
  caller?: OpenAIV1ImagesEditsProviderCaller;
};

export type OpenAIV1ImagesEditsResponseEnvelope = {
  provider: "openai";
  endpoint: typeof OPENAI_V1_IMAGES_EDITS_ENDPOINT;
  mode: "dry-run" | "mock" | "caller";
  raw: unknown;
  providerFieldsOpaque: true;
};

export type OpenAIV1ImagesEditsCapabilitySignal = {
  provider: "openai";
  endpoint: typeof OPENAI_V1_IMAGES_EDITS_ENDPOINT;
  operation: "edit-image";
  rawShape: "image-list" | "mock" | "dry-run";
};

export type OpenAIV1ImagesEditsError = {
  code: OpenAIV1ImagesEditsErrorCode;
  message: string;
  boundary: OpenAIV1ImagesEditsBoundary;
  retryable: boolean;
};

export type OpenAIV1ImagesEditsResult =
  | {
      ok: true;
      request: OpenAIV1ImagesEditsRequestEnvelope;
      response: OpenAIV1ImagesEditsResponseEnvelope;
      capability: OpenAIV1ImagesEditsCapabilitySignal;
      events: readonly string[];
    }
  | {
      ok: false;
      error: OpenAIV1ImagesEditsError;
      request?: OpenAIV1ImagesEditsRequestEnvelope;
      events: readonly string[];
    };

function hasText(value: string | undefined): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isImageInput(value: unknown): value is OpenAIV1ImagesEditInput {
  return isRecord(value);
}

function cleanScopes(scopes: readonly string[] | undefined): readonly string[] {
  return [...new Set((scopes ?? []).map((scope) => scope.trim()).filter(Boolean))];
}

function cleanHeaders(headers: OpenAIV1ImagesEditsInvocationRequest["headers"]): Readonly<Record<string, string>> {
  return Object.fromEntries(
    Object.entries(headers ?? {})
      .filter((entry): entry is [string, string] => typeof entry[1] === "string" && entry[1].trim().length > 0)
      .map(([key, value]) => [key.trim().toLowerCase(), value.trim()]),
  );
}

function normalizeBaseUrl(baseUrl: string | undefined): string {
  return hasText(baseUrl) ? baseUrl.trim().replace(/\/+$/, "") : DEFAULT_OPENAI_V1_IMAGES_EDITS_BASE_URL;
}

function failure(
  code: OpenAIV1ImagesEditsErrorCode,
  message: string,
  boundary: OpenAIV1ImagesEditsBoundary,
  retryable = false,
  request?: OpenAIV1ImagesEditsRequestEnvelope,
): OpenAIV1ImagesEditsResult {
  return {
    ok: false,
    error: { code, message, boundary, retryable },
    request,
    events: ["agentCore.modelAdapter.openai.v1.images.edits.rejected"],
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

export function classifyOpenAIV1ImagesEditsProviderError(error: unknown): OpenAIV1ImagesEditsErrorCode {
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

export async function invokeOpenAIV1ImagesEdits(
  input: OpenAIV1ImagesEditsInvocationRequest = {},
): Promise<OpenAIV1ImagesEditsResult> {
  if (input.body === undefined) {
    return failure("MISSING_BODY", "OpenAI v1 images edits invocation requires an opaque provider body", "input");
  }

  const images = (input.images ?? []).filter(isImageInput);
  if (images.length === 0) {
    return failure("MISSING_IMAGE", "OpenAI v1 images edits invocation requires at least one image handle", "input");
  }

  const runtime = input.runtime;
  if (runtime === undefined || !hasText(runtime.runtimeId)) {
    return failure("MISSING_RUNTIME_ID", "OpenAI v1 images edits invocation requires runtime.runtimeId", "input");
  }

  if (input.contract?.accepted === false) {
    return failure(
      "CONTRACT_REJECTED",
      input.contract.reason ?? "OpenAI v1 images edits contract rejected the request",
      "contract",
    );
  }

  if (input.governance?.accepted === false) {
    return failure(
      "GOVERNANCE_REJECTED",
      input.governance.reason ?? "OpenAI v1 images edits governance rejected the request",
      "governance",
    );
  }

  if (input.auth?.present === false) {
    return failure("AUTH_REJECTED", "OpenAI v1 images edits auth envelope is unavailable", "auth");
  }

  const requestedScopes = cleanScopes(input.requiredScopes);
  const allowedScopes = cleanScopes(input.allowedScopes);
  const deniedScopes =
    allowedScopes.length === 0 ? [] : requestedScopes.filter((scope) => !allowedScopes.includes(scope));

  if (deniedScopes.length > 0) {
    return failure(
      "SCOPE_DENIED",
      `OpenAI v1 images edits requested scopes outside the allowed boundary: ${deniedScopes.join(", ")}`,
      "scope",
    );
  }

  const request: OpenAIV1ImagesEditsRequestEnvelope = {
    provider: "openai",
    apiVersion: "v1",
    endpoint: OPENAI_V1_IMAGES_EDITS_ENDPOINT,
    operation: "edit-image",
    method: "POST",
    url: `${normalizeBaseUrl(input.baseUrl)}${OPENAI_V1_IMAGES_EDITS_ENDPOINT}`,
    headers: cleanHeaders(input.headers),
    body: input.body,
    images,
    mask: input.mask,
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
        endpoint: OPENAI_V1_IMAGES_EDITS_ENDPOINT,
        mode: input.mockResponse === undefined ? "dry-run" : "mock",
        raw: input.mockResponse ?? null,
        providerFieldsOpaque: true,
      },
      capability: {
        provider: "openai",
        endpoint: OPENAI_V1_IMAGES_EDITS_ENDPOINT,
        operation: "edit-image",
        rawShape: input.mockResponse === undefined ? "dry-run" : "mock",
      },
      events: ["agentCore.modelAdapter.openai.v1.images.edits.dryRun"],
    };
  }

  if (input.caller === undefined) {
    return failure(
      "CALLER_REQUIRED",
      "OpenAI v1 images edits live invocation requires an injected provider caller",
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
        "OpenAI v1 images edits response did not match the expected image list envelope",
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
        endpoint: OPENAI_V1_IMAGES_EDITS_ENDPOINT,
        mode: "caller",
        raw,
        providerFieldsOpaque: true,
      },
      capability: {
        provider: "openai",
        endpoint: OPENAI_V1_IMAGES_EDITS_ENDPOINT,
        operation: "edit-image",
        rawShape: "image-list",
      },
      events: ["agentCore.modelAdapter.openai.v1.images.edits.called"],
    };
  } catch (error) {
    const code = classifyOpenAIV1ImagesEditsProviderError(error);
    return failure(
      code,
      `OpenAI v1 images edits provider caller failed with ${code}`,
      code === "RESPONSE_FORMAT_DRIFT" ? "response" : "provider",
      code === "PROVIDER_RATE_LIMITED" || code === "PROVIDER_TIMEOUT" || code === "PROVIDER_UNAVAILABLE",
      request,
    );
  }
}
