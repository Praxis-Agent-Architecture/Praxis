/*
 * 文件定位：Agent 模型适配层 / 真实上游调用层 / Anthropic 官方调用面。
 * 核心目的：承接 Anthropic 上游的 v1 messages batches 真实调用面。
 * 能力要求1：需要把对应 endpoint 的请求参数、响应形态、错误形态和能力信号整理成可适配对象。
 * 能力要求2：鉴权/API 登录后续会接入，但这里要为“上游能力变得实际可用”预留位置。
 * 能力要求3：不把该 provider 的字段形状提升为 Praxis 统一语义，只作为 actualInvocationLayer 的现实入口。
 * 边界：只处理上游实际调用面，不在这里定义 agentCore 使用 AI 的统一方式。
 * 对接：需要被 runtime.modelAdapter 拉起，并和 provider/carrier、PromptPack lowering、能力抽象链路接通。
 * 实现提示：先补稳定类型契约、最小可测行为和清晰错误边界，再接入真实执行逻辑。
 */

export const ANTHROPIC_V1_MESSAGES_BATCHES_ENDPOINT = "/v1/messages/batches" as const;
export const DEFAULT_ANTHROPIC_V1_MESSAGES_BATCHES_BASE_URL = "https://api.anthropic.com" as const;
export const DEFAULT_ANTHROPIC_VERSION = "2023-06-01" as const;

export type AnthropicV1MessagesBatchesOperation = "create" | "list" | "retrieve" | "cancel" | "results";
export type AnthropicV1MessagesBatchesMethod = "GET" | "POST";

export type AnthropicV1MessagesBatchesBoundary =
  | "input"
  | "contract"
  | "governance"
  | "provider"
  | "timeout"
  | "response";

export type AnthropicV1MessagesBatchesErrorCode =
  | "MISSING_REQUEST"
  | "MISSING_OPERATION"
  | "MISSING_BATCH_ID"
  | "MISSING_REQUEST_BODY"
  | "MISSING_AUTH_TOKEN"
  | "CONTRACT_REJECTED"
  | "GOVERNANCE_REJECTED"
  | "TRANSPORT_UNAVAILABLE"
  | "PROVIDER_AUTH_FAILED"
  | "PROVIDER_RATE_LIMITED"
  | "PROVIDER_TIMEOUT"
  | "PROVIDER_UNAVAILABLE"
  | "PROVIDER_ERROR"
  | "RESPONSE_FORMAT_DRIFT";

export type AnthropicV1MessagesBatchesGate = {
  accepted: boolean;
  reason?: string;
};

export type AnthropicV1MessagesBatchesRuntimeContext = {
  runtimeId?: string;
  invocationId?: string;
  traceId?: string;
};

export type AnthropicV1MessagesBatchesBody = Readonly<Record<string, unknown>>;

export type AnthropicV1MessagesBatchesProviderEnvelope = {
  provider: "anthropic";
  endpoint: typeof ANTHROPIC_V1_MESSAGES_BATCHES_ENDPOINT;
  operation: AnthropicV1MessagesBatchesOperation;
  method: AnthropicV1MessagesBatchesMethod;
  url: string;
  headers: Readonly<Record<string, string>>;
  body?: AnthropicV1MessagesBatchesBody;
  timeoutMs: number;
  dryRun: boolean;
  providerCallPlanned: boolean;
  runtime: AnthropicV1MessagesBatchesRuntimeContext;
};

export type AnthropicV1MessagesBatchesProviderResult = {
  statusCode: number;
  body: unknown;
  headers?: Readonly<Record<string, string>>;
};

export type AnthropicV1MessagesBatchesTransport = (
  envelope: AnthropicV1MessagesBatchesProviderEnvelope,
) => Promise<AnthropicV1MessagesBatchesProviderResult> | AnthropicV1MessagesBatchesProviderResult;

export type AnthropicV1MessagesBatchesRequest = {
  operation?: AnthropicV1MessagesBatchesOperation;
  batchId?: string;
  baseUrl?: string;
  apiKey?: string;
  anthropicVersion?: string;
  body?: AnthropicV1MessagesBatchesBody;
  timeoutMs?: number;
  dryRun?: boolean;
  runtime?: AnthropicV1MessagesBatchesRuntimeContext;
  contract?: AnthropicV1MessagesBatchesGate;
  governance?: AnthropicV1MessagesBatchesGate;
  transport?: AnthropicV1MessagesBatchesTransport;
};

export type AnthropicV1MessagesBatchesResponseEnvelope = {
  kind: "dry-run" | "provider";
  statusCode?: number;
  body: unknown;
  headers?: Readonly<Record<string, string>>;
};

export type AnthropicV1MessagesBatchesCapabilitySignal = {
  provider: "anthropic";
  endpoint: typeof ANTHROPIC_V1_MESSAGES_BATCHES_ENDPOINT;
  operation: AnthropicV1MessagesBatchesOperation;
  rawShape: "batch-object" | "batch-results" | "dry-run";
};

export type AnthropicV1MessagesBatchesError = {
  code: AnthropicV1MessagesBatchesErrorCode;
  message: string;
  boundary: AnthropicV1MessagesBatchesBoundary;
  statusCode?: number;
};

export type AnthropicV1MessagesBatchesResult =
  | {
      ok: true;
      envelope: AnthropicV1MessagesBatchesProviderEnvelope;
      response: AnthropicV1MessagesBatchesResponseEnvelope;
      capability: AnthropicV1MessagesBatchesCapabilitySignal;
      events: readonly string[];
    }
  | {
      ok: false;
      error: AnthropicV1MessagesBatchesError;
      envelope?: AnthropicV1MessagesBatchesProviderEnvelope;
      events: readonly string[];
    };

function hasText(value: string | undefined): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function headers(apiKey: string | undefined, anthropicVersion: string | undefined): Record<string, string> {
  const result: Record<string, string> = {
    "anthropic-version": hasText(anthropicVersion) ? anthropicVersion.trim() : DEFAULT_ANTHROPIC_VERSION,
    "content-type": "application/json",
  };

  if (hasText(apiKey)) {
    result["x-api-key"] = apiKey.trim();
  }

  return result;
}

function endpointPath(operation: AnthropicV1MessagesBatchesOperation, batchId: string | undefined): string {
  if (operation === "retrieve") {
    return `${ANTHROPIC_V1_MESSAGES_BATCHES_ENDPOINT}/${batchId}`;
  }

  if (operation === "cancel") {
    return `${ANTHROPIC_V1_MESSAGES_BATCHES_ENDPOINT}/${batchId}/cancel`;
  }

  if (operation === "results") {
    return `${ANTHROPIC_V1_MESSAGES_BATCHES_ENDPOINT}/${batchId}/results`;
  }

  return ANTHROPIC_V1_MESSAGES_BATCHES_ENDPOINT;
}

function methodFor(operation: AnthropicV1MessagesBatchesOperation): AnthropicV1MessagesBatchesMethod {
  return operation === "create" || operation === "cancel" ? "POST" : "GET";
}

function buildUrl(baseUrl: string | undefined, operation: AnthropicV1MessagesBatchesOperation, batchId?: string): string {
  const base = hasText(baseUrl)
    ? baseUrl.trim().replace(/\/+$/, "")
    : DEFAULT_ANTHROPIC_V1_MESSAGES_BATCHES_BASE_URL;
  return `${base}${endpointPath(operation, batchId)}`;
}

function failure(
  code: AnthropicV1MessagesBatchesErrorCode,
  message: string,
  boundary: AnthropicV1MessagesBatchesBoundary,
  envelope?: AnthropicV1MessagesBatchesProviderEnvelope,
  statusCode?: number,
): AnthropicV1MessagesBatchesResult {
  return {
    ok: false,
    error: { code, message, boundary, statusCode },
    envelope,
    events: ["anthropic.v1.messages.batches.rejected"],
  };
}

function classifyStatus(statusCode: number): AnthropicV1MessagesBatchesError | undefined {
  if (statusCode >= 200 && statusCode < 300) {
    return undefined;
  }

  if (statusCode === 401 || statusCode === 403) {
    return {
      code: "PROVIDER_AUTH_FAILED",
      message: "Anthropic v1 messages batches rejected authentication or authorization",
      boundary: "provider",
      statusCode,
    };
  }

  if (statusCode === 408) {
    return {
      code: "PROVIDER_TIMEOUT",
      message: "Anthropic v1 messages batches request timed out upstream",
      boundary: "timeout",
      statusCode,
    };
  }

  if (statusCode === 429) {
    return {
      code: "PROVIDER_RATE_LIMITED",
      message: "Anthropic v1 messages batches request was rate limited",
      boundary: "provider",
      statusCode,
    };
  }

  if (statusCode >= 500) {
    return {
      code: "PROVIDER_UNAVAILABLE",
      message: "Anthropic v1 messages batches endpoint is unavailable",
      boundary: "provider",
      statusCode,
    };
  }

  return {
    code: "PROVIDER_ERROR",
    message: "Anthropic v1 messages batches endpoint returned an unsuccessful status",
    boundary: "provider",
    statusCode,
  };
}

function classifyThrown(error: unknown): AnthropicV1MessagesBatchesError {
  if (isRecord(error) && (error.name === "AbortError" || error.code === "ETIMEDOUT")) {
    return {
      code: "PROVIDER_TIMEOUT",
      message: "Anthropic v1 messages batches transport timed out",
      boundary: "timeout",
    };
  }

  return {
    code: "PROVIDER_ERROR",
    message: "Anthropic v1 messages batches transport failed before returning a provider response",
    boundary: "provider",
  };
}

function assertBatchBody(
  operation: AnthropicV1MessagesBatchesOperation,
  body: unknown,
): AnthropicV1MessagesBatchesError | undefined {
  if (operation === "results") {
    if (typeof body === "string" || Array.isArray(body) || isRecord(body)) {
      return undefined;
    }
  } else if (isRecord(body)) {
    return undefined;
  }

  return {
    code: "RESPONSE_FORMAT_DRIFT",
    message: "Anthropic v1 messages batches response shape drifted from a provider object/results payload",
    boundary: "response",
  };
}

function capabilityShape(operation: AnthropicV1MessagesBatchesOperation): "batch-object" | "batch-results" {
  return operation === "results" ? "batch-results" : "batch-object";
}

export async function invokeAnthropicV1MessagesBatches(
  request?: AnthropicV1MessagesBatchesRequest,
): Promise<AnthropicV1MessagesBatchesResult> {
  if (request === undefined) {
    return failure("MISSING_REQUEST", "Anthropic v1 messages batches invocation requires a request object", "input");
  }

  if (request.operation === undefined) {
    return failure("MISSING_OPERATION", "Anthropic v1 messages batches invocation requires an operation", "input");
  }

  if (
    (request.operation === "retrieve" || request.operation === "cancel" || request.operation === "results") &&
    !hasText(request.batchId)
  ) {
    return failure(
      "MISSING_BATCH_ID",
      "Anthropic v1 messages batches invocation requires batchId for the selected operation",
      "input",
    );
  }

  if (request.operation === "create" && !isRecord(request.body)) {
    return failure(
      "MISSING_REQUEST_BODY",
      "Anthropic v1 messages batches create invocation requires a provider request body",
      "input",
    );
  }

  if (request.contract?.accepted === false) {
    return failure(
      "CONTRACT_REJECTED",
      request.contract.reason ?? "Anthropic v1 messages batches invocation was rejected by contract checks",
      "contract",
    );
  }

  if (request.governance?.accepted === false) {
    return failure(
      "GOVERNANCE_REJECTED",
      request.governance.reason ?? "Anthropic v1 messages batches invocation was rejected by governance",
      "governance",
    );
  }

  const dryRun = request.dryRun !== false;
  const batchId = request.batchId?.trim();
  const envelope: AnthropicV1MessagesBatchesProviderEnvelope = {
    provider: "anthropic",
    endpoint: ANTHROPIC_V1_MESSAGES_BATCHES_ENDPOINT,
    operation: request.operation,
    method: methodFor(request.operation),
    url: buildUrl(request.baseUrl, request.operation, batchId),
    headers: headers(request.apiKey, request.anthropicVersion),
    body: request.body,
    timeoutMs: request.timeoutMs ?? 30_000,
    dryRun,
    providerCallPlanned: !dryRun,
    runtime: request.runtime ?? {},
  };

  if (dryRun) {
    return {
      ok: true,
      envelope,
      response: { kind: "dry-run", body: null },
      capability: {
        provider: "anthropic",
        endpoint: ANTHROPIC_V1_MESSAGES_BATCHES_ENDPOINT,
        operation: request.operation,
        rawShape: "dry-run",
      },
      events: ["anthropic.v1.messages.batches.planned"],
    };
  }

  if (!hasText(request.apiKey)) {
    return failure(
      "MISSING_AUTH_TOKEN",
      "Anthropic v1 messages batches live invocation requires apiKey",
      "input",
      envelope,
    );
  }

  if (request.transport === undefined) {
    return failure(
      "TRANSPORT_UNAVAILABLE",
      "Anthropic v1 messages batches live invocation requires an injected transport",
      "provider",
      envelope,
    );
  }

  try {
    const providerResult = await request.transport(envelope);
    const statusError = classifyStatus(providerResult.statusCode);
    if (statusError !== undefined) {
      return failure(statusError.code, statusError.message, statusError.boundary, envelope, statusError.statusCode);
    }

    const bodyError = assertBatchBody(request.operation, providerResult.body);
    if (bodyError !== undefined) {
      return failure(bodyError.code, bodyError.message, bodyError.boundary, envelope);
    }

    return {
      ok: true,
      envelope,
      response: {
        kind: "provider",
        statusCode: providerResult.statusCode,
        body: providerResult.body,
        headers: providerResult.headers,
      },
      capability: {
        provider: "anthropic",
        endpoint: ANTHROPIC_V1_MESSAGES_BATCHES_ENDPOINT,
        operation: request.operation,
        rawShape: capabilityShape(request.operation),
      },
      events: ["anthropic.v1.messages.batches.invoked"],
    };
  } catch (error) {
    const classified = classifyThrown(error);
    return failure(classified.code, classified.message, classified.boundary, envelope);
  }
}
