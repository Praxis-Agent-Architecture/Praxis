/*
 * 文件定位：Agent 模型适配层 / 真实上游调用层 / OpenAI 官方调用面。
 * 核心目的：承接 OpenAI 上游的 v1 chatkit threads 真实调用面。
 * 能力要求1：需要把对应 endpoint 的请求参数、响应形态、错误形态和能力信号整理成可适配对象。
 * 能力要求2：鉴权/API 登录后续会接入，但这里要为“上游能力变得实际可用”预留位置。
 * 能力要求3：不把该 provider 的字段形状提升为 Praxis 统一语义，只作为 actualInvocationLayer 的现实入口。
 * 边界：只处理上游实际调用面，不在这里定义 agentCore 使用 AI 的统一方式。
 * 对接：需要被 runtime.modelAdapter 拉起，并和 provider/carrier、PromptPack lowering、能力抽象链路接通。
 * 实现提示：先补稳定类型契约、最小可测行为和清晰错误边界，再接入真实执行逻辑。
 */

export const OPENAI_V1_CHATKIT_THREADS_ENDPOINT = "/v1/chatkit/threads" as const;

export type OpenAiV1ChatkitThreadsMethod = "POST";

export type OpenAiV1ChatkitThreadsGate = {
  accepted: boolean;
  reason?: string;
};

export type OpenAiV1ChatkitThreadsTrace = {
  correlationId?: string;
  callerId?: string;
};

export type OpenAiV1ChatkitThreadsMockCallerRequest = {
  provider: "openai";
  endpoint: typeof OPENAI_V1_CHATKIT_THREADS_ENDPOINT;
  url: string;
  method: OpenAiV1ChatkitThreadsMethod;
  requestBody: Record<string, unknown>;
  headers: {
    authorization?: string;
    organization?: string;
    project?: string;
  };
  timeoutMs: number;
  trace: OpenAiV1ChatkitThreadsTrace;
};

export type OpenAiV1ChatkitThreadsMockCallerResponse = {
  status: number;
  body?: unknown;
  headers?: Record<string, string>;
};

export type OpenAiV1ChatkitThreadsMockCaller = (
  request: OpenAiV1ChatkitThreadsMockCallerRequest,
) => Promise<OpenAiV1ChatkitThreadsMockCallerResponse> | OpenAiV1ChatkitThreadsMockCallerResponse;

export type OpenAiV1ChatkitThreadsInvocationRequest = {
  requestBody?: unknown;
  baseUrl?: string;
  apiKey?: string;
  organizationId?: string;
  projectId?: string;
  timeoutMs?: number;
  trace?: OpenAiV1ChatkitThreadsTrace;
  contract?: OpenAiV1ChatkitThreadsGate;
  governance?: OpenAiV1ChatkitThreadsGate;
  dryRun?: boolean;
  mockCaller?: OpenAiV1ChatkitThreadsMockCaller;
};

export type OpenAiV1ChatkitThreadsErrorCode =
  | "MISSING_REQUEST"
  | "MISSING_REQUEST_BODY"
  | "INVALID_REQUEST_BODY"
  | "INVALID_TIMEOUT"
  | "CONTRACT_REJECTED"
  | "GOVERNANCE_REJECTED"
  | "MISSING_MOCK_CALLER"
  | "UPSTREAM_AUTH_FAILED"
  | "UPSTREAM_RATE_LIMITED"
  | "UPSTREAM_TIMEOUT"
  | "UPSTREAM_UNAVAILABLE"
  | "UPSTREAM_RESPONSE_DRIFT"
  | "UPSTREAM_ERROR";

export type OpenAiV1ChatkitThreadsErrorBoundary = "input" | "contract" | "governance" | "provider";

export type OpenAiV1ChatkitThreadsInvocationError = {
  code: OpenAiV1ChatkitThreadsErrorCode;
  message: string;
  boundary: OpenAiV1ChatkitThreadsErrorBoundary;
  providerSafe: true;
};

export type OpenAiV1ChatkitThreadsProviderEnvelope = {
  provider: "openai";
  endpoint: typeof OPENAI_V1_CHATKIT_THREADS_ENDPOINT;
  url: string;
  method: OpenAiV1ChatkitThreadsMethod;
  requestBody: Record<string, unknown>;
  status?: number;
  rawResponse?: unknown;
  responseHeaders?: Record<string, string>;
  authState: "missing" | "provided";
  capabilitySignals: {
    actualInvocationLayer: true;
    providerShapePreserved: true;
    endpoint: typeof OPENAI_V1_CHATKIT_THREADS_ENDPOINT;
    mockable: true;
  };
  trace: OpenAiV1ChatkitThreadsTrace;
  dryRun: boolean;
  unsafeSideEffects: false;
};

export type OpenAiV1ChatkitThreadsInvocationResult =
  | {
      ok: true;
      envelope: OpenAiV1ChatkitThreadsProviderEnvelope;
      events: readonly string[];
    }
  | {
      ok: false;
      error: OpenAiV1ChatkitThreadsInvocationError;
      events: readonly string[];
    };

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function failure(
  code: OpenAiV1ChatkitThreadsErrorCode,
  message: string,
  boundary: OpenAiV1ChatkitThreadsErrorBoundary,
): OpenAiV1ChatkitThreadsInvocationResult {
  return {
    ok: false,
    error: { code, message, boundary, providerSafe: true },
    events: ["agentCore.modelAdapter.openai.v1_chatkit_threads.rejected"],
  };
}

function cleanTrace(trace: OpenAiV1ChatkitThreadsTrace | undefined): OpenAiV1ChatkitThreadsTrace {
  return {
    correlationId: trace?.correlationId?.trim() || undefined,
    callerId: trace?.callerId?.trim() || undefined,
  };
}

function endpointUrl(request: OpenAiV1ChatkitThreadsInvocationRequest): string {
  const baseUrl = (request.baseUrl?.trim() || "https://api.openai.com").replace(/\/+$/, "");
  return `${baseUrl}${OPENAI_V1_CHATKIT_THREADS_ENDPOINT}`;
}

function toEnvelope(
  request: OpenAiV1ChatkitThreadsInvocationRequest,
  requestBody: Record<string, unknown>,
  response?: OpenAiV1ChatkitThreadsMockCallerResponse,
): OpenAiV1ChatkitThreadsProviderEnvelope {
  return {
    provider: "openai",
    endpoint: OPENAI_V1_CHATKIT_THREADS_ENDPOINT,
    url: endpointUrl(request),
    method: "POST",
    requestBody,
    status: response?.status,
    rawResponse: response?.body,
    responseHeaders: response?.headers,
    authState: request.apiKey?.trim() ? "provided" : "missing",
    capabilitySignals: {
      actualInvocationLayer: true,
      providerShapePreserved: true,
      endpoint: OPENAI_V1_CHATKIT_THREADS_ENDPOINT,
      mockable: true,
    },
    trace: cleanTrace(request.trace),
    dryRun: request.dryRun !== false,
    unsafeSideEffects: false,
  };
}

function classifyStatus(
  response: OpenAiV1ChatkitThreadsMockCallerResponse,
): OpenAiV1ChatkitThreadsInvocationError | undefined {
  if (response.status === 401 || response.status === 403) {
    return {
      code: "UPSTREAM_AUTH_FAILED",
      message: "OpenAI v1 chatkit threads mock caller reported an authentication failure",
      boundary: "provider",
      providerSafe: true,
    };
  }

  if (response.status === 429) {
    return {
      code: "UPSTREAM_RATE_LIMITED",
      message: "OpenAI v1 chatkit threads mock caller reported rate limiting",
      boundary: "provider",
      providerSafe: true,
    };
  }

  if (response.status === 408 || response.status === 504) {
    return {
      code: "UPSTREAM_TIMEOUT",
      message: "OpenAI v1 chatkit threads mock caller reported a timeout",
      boundary: "provider",
      providerSafe: true,
    };
  }

  if (response.status >= 500) {
    return {
      code: "UPSTREAM_UNAVAILABLE",
      message: "OpenAI v1 chatkit threads mock caller reported provider unavailability",
      boundary: "provider",
      providerSafe: true,
    };
  }

  if (response.status >= 400) {
    return {
      code: "UPSTREAM_ERROR",
      message: "OpenAI v1 chatkit threads mock caller reported an upstream error",
      boundary: "provider",
      providerSafe: true,
    };
  }

  if (response.body === undefined || response.body === null) {
    return {
      code: "UPSTREAM_RESPONSE_DRIFT",
      message: "OpenAI v1 chatkit threads mock caller returned an empty provider response",
      boundary: "provider",
      providerSafe: true,
    };
  }

  return undefined;
}

function classifyThrown(error: unknown): OpenAiV1ChatkitThreadsInvocationError {
  const maybeError = error as { name?: unknown; code?: unknown; message?: unknown };
  const name = typeof maybeError.name === "string" ? maybeError.name : "";
  const code = typeof maybeError.code === "string" ? maybeError.code : "";
  const message = typeof maybeError.message === "string" ? maybeError.message : "mock caller failed";
  const timedOut = name === "AbortError" || code === "ETIMEDOUT" || code === "TIMEOUT";

  return {
    code: timedOut ? "UPSTREAM_TIMEOUT" : "UPSTREAM_ERROR",
    message: timedOut ? "OpenAI v1 chatkit threads mock caller timed out" : message,
    boundary: "provider",
    providerSafe: true,
  };
}

export async function invokeOpenAiV1ChatkitThreads(
  request?: OpenAiV1ChatkitThreadsInvocationRequest,
): Promise<OpenAiV1ChatkitThreadsInvocationResult> {
  if (request === undefined) {
    return failure(
      "MISSING_REQUEST",
      "OpenAI v1 chatkit threads invocation requires an explicit request envelope",
      "input",
    );
  }

  if (request.requestBody === undefined) {
    return failure(
      "MISSING_REQUEST_BODY",
      "OpenAI v1 chatkit threads invocation requires a provider request body",
      "input",
    );
  }

  if (!isRecord(request.requestBody)) {
    return failure("INVALID_REQUEST_BODY", "OpenAI v1 chatkit threads requestBody must be a JSON object envelope", "input");
  }

  if (request.timeoutMs !== undefined && request.timeoutMs <= 0) {
    return failure("INVALID_TIMEOUT", "OpenAI v1 chatkit threads timeoutMs must be greater than zero", "input");
  }

  if (request.contract?.accepted === false) {
    return failure(
      "CONTRACT_REJECTED",
      request.contract.reason ?? "OpenAI v1 chatkit threads contract gate rejected the call",
      "contract",
    );
  }

  if (request.governance?.accepted === false) {
    return failure(
      "GOVERNANCE_REJECTED",
      request.governance.reason ?? "OpenAI v1 chatkit threads governance gate rejected the call",
      "governance",
    );
  }

  if (request.dryRun !== false) {
    return {
      ok: true,
      envelope: toEnvelope(request, request.requestBody),
      events: ["agentCore.modelAdapter.openai.v1_chatkit_threads.dryRunPlanned"],
    };
  }

  if (request.mockCaller === undefined) {
    return failure(
      "MISSING_MOCK_CALLER",
      "OpenAI v1 chatkit threads first implementation only executes through mockCaller",
      "provider",
    );
  }

  const callerRequest: OpenAiV1ChatkitThreadsMockCallerRequest = {
    provider: "openai",
    endpoint: OPENAI_V1_CHATKIT_THREADS_ENDPOINT,
    url: endpointUrl(request),
    method: "POST",
    requestBody: request.requestBody,
    headers: {
      authorization: request.apiKey?.trim() ? `Bearer ${request.apiKey.trim()}` : undefined,
      organization: request.organizationId?.trim() || undefined,
      project: request.projectId?.trim() || undefined,
    },
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
        events: ["agentCore.modelAdapter.openai.v1_chatkit_threads.providerRejected"],
      };
    }

    return {
      ok: true,
      envelope: toEnvelope(request, request.requestBody, response),
      events: ["agentCore.modelAdapter.openai.v1_chatkit_threads.mockResponseReceived"],
    };
  } catch (error) {
    return {
      ok: false,
      error: classifyThrown(error),
      events: ["agentCore.modelAdapter.openai.v1_chatkit_threads.providerRejected"],
    };
  }
}
