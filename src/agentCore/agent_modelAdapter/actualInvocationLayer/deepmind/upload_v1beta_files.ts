/*
 * 文件定位：Agent 模型适配层 / 真实上游调用层 / DeepMind/Gemini 官方调用面。
 * 核心目的：承接 DeepMind/Gemini 上游的 upload v1beta files 真实调用面。
 * 能力要求1：需要把对应 endpoint 的请求参数、响应形态、错误形态和能力信号整理成可适配对象。
 * 能力要求2：鉴权/API 登录后续会接入，但这里要为“上游能力变得实际可用”预留位置。
 * 能力要求3：不把该 provider 的字段形状提升为 Praxis 统一语义，只作为 actualInvocationLayer 的现实入口。
 * 边界：只处理上游实际调用面，不在这里定义 agentCore 使用 AI 的统一方式。
 * 对接：需要被 runtime.modelAdapter 拉起，并和 provider/carrier、PromptPack lowering、能力抽象链路接通。
 * 实现提示：先补稳定类型契约、最小可测行为和清晰错误边界，再接入真实执行逻辑。
 */

export type DeepMindUploadBoundary = "input" | "contract" | "governance" | "provider-config";

export type DeepMindUploadGate = {
  accepted: boolean;
  reason?: string;
};

export type DeepMindUploadTrace = {
  correlationId?: string;
  callerId?: string;
  source?: string;
};

export type DeepMindUploadProtocol = "resumable" | "multipart" | "raw";

export type DeepMindUploadFileDescriptor = {
  displayName?: string;
  mimeType?: string;
  sizeBytes?: number;
  uri?: string;
};

export type DeepMindUploadV1BetaFilesRequest = {
  file?: DeepMindUploadFileDescriptor;
  uploadProtocol?: DeepMindUploadProtocol;
  apiKeyPresent?: boolean;
  responseBody?: Readonly<Record<string, unknown>>;
  upstreamError?: unknown;
  contract?: DeepMindUploadGate;
  governance?: DeepMindUploadGate;
  trace?: DeepMindUploadTrace;
  metadata?: Readonly<Record<string, unknown>>;
};

export type DeepMindUploadFileEnvelope = {
  displayName: string;
  mimeType: string;
  sizeBytes?: number;
  uri?: string;
};

export type DeepMindUploadErrorCategory =
  | "auth"
  | "rate-limit"
  | "timeout"
  | "endpoint-unavailable"
  | "format-drift"
  | "provider-error"
  | "unknown";

export type DeepMindUploadProviderError = {
  category: DeepMindUploadErrorCategory;
  message: string;
  status?: number;
  keyHints: readonly string[];
  rawProviderFieldsExposed: false;
};

export type DeepMindUploadV1BetaFilesPlan = {
  provider: "deepmind";
  endpointId: "upload.v1beta.files";
  endpointPath: "/upload/v1beta/files";
  method: "POST";
  uploadProtocol: DeepMindUploadProtocol;
  file: DeepMindUploadFileEnvelope;
  auth: {
    required: true;
    present: boolean;
  };
  responseEnvelope?: {
    retained: false;
    keyHints: readonly string[];
  };
  errorEnvelope?: DeepMindUploadProviderError;
  capabilitySignal: {
    capabilityId: "deepmind.upload.v1beta.files";
    supportsFileUpload: true;
    authRequired: true;
    usableByAbstractionLayer: boolean;
  };
  metadata: Readonly<Record<string, unknown>>;
  trace: DeepMindUploadTrace;
  providerCarrierHandoff: {
    target: "providerCarrierRegistry";
    mockable: true;
    networkCallStarted: false;
  };
  abstractionHandoff: {
    target: "agent_modelAdapter.abstractionLayer";
    rawProviderFieldsExposed: false;
  };
  audit: {
    plannedBy: "deepmind.upload_v1beta_files";
    dryRun: true;
    unsafeSideEffects: false;
  };
};

export type DeepMindUploadV1BetaFilesErrorCode =
  | "MISSING_FILE"
  | "MISSING_DISPLAY_NAME"
  | "MISSING_MIME_TYPE"
  | "INVALID_FILE_SIZE"
  | "RESPONSE_FORMAT_DRIFT"
  | "CONTRACT_REJECTED"
  | "GOVERNANCE_REJECTED";

export type DeepMindUploadV1BetaFilesError = {
  code: DeepMindUploadV1BetaFilesErrorCode;
  message: string;
  boundary: DeepMindUploadBoundary | "provider-response";
  safeForRuntimeInspection: true;
  rawProviderFieldsExposed: false;
};

export type DeepMindUploadV1BetaFilesResult =
  | {
      ok: true;
      plan: DeepMindUploadV1BetaFilesPlan;
      events: readonly string[];
    }
  | {
      ok: false;
      error: DeepMindUploadV1BetaFilesError;
      events: readonly string[];
    };

export const deepMindUploadV1BetaFilesDescriptor = {
  layer: "agent_modelAdapter.actualInvocationLayer.deepmind",
  capability: "deepmind.upload.v1beta.files",
  endpointPath: "/upload/v1beta/files",
  dryRun: true,
  unsafeSideEffects: false,
  providerFieldsPromotedToPraxisContract: false,
} as const;

export function cleanDeepMindUploadText(value: string | undefined): string | undefined {
  const cleaned = value?.trim();
  return cleaned === undefined || cleaned.length === 0 ? undefined : cleaned;
}

export function isDeepMindUploadRecord(value: unknown): value is Readonly<Record<string, unknown>> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export function classifyDeepMindUploadError(error: unknown): DeepMindUploadProviderError {
  const status = isDeepMindUploadRecord(error) ? error.status ?? error.statusCode ?? error.code : undefined;
  const numericStatus = typeof status === "number" && Number.isSafeInteger(status) ? status : undefined;
  const rawMessage =
    error instanceof Error
      ? error.message
      : typeof error === "string"
        ? error
        : isDeepMindUploadRecord(error) && typeof error.message === "string"
          ? error.message
          : "DeepMind/Gemini upload endpoint returned an upstream error";
  const message = cleanDeepMindUploadText(rawMessage) ?? "DeepMind/Gemini upload endpoint returned an upstream error";
  const lower = message.toLowerCase();

  let category: DeepMindUploadErrorCategory = numericStatus === undefined ? "unknown" : "provider-error";
  if (numericStatus === 401 || numericStatus === 403 || lower.includes("auth") || lower.includes("permission")) {
    category = "auth";
  } else if (numericStatus === 429 || lower.includes("rate limit")) {
    category = "rate-limit";
  } else if (numericStatus === 408 || lower.includes("timeout") || lower.includes("timed out")) {
    category = "timeout";
  } else if (numericStatus === 404 || numericStatus === 503 || lower.includes("unavailable")) {
    category = "endpoint-unavailable";
  } else if (lower.includes("schema") || lower.includes("format")) {
    category = "format-drift";
  }

  return {
    category,
    message,
    status: numericStatus,
    keyHints: isDeepMindUploadRecord(error) ? Object.keys(error).sort() : [],
    rawProviderFieldsExposed: false,
  };
}

function failure(
  code: DeepMindUploadV1BetaFilesErrorCode,
  message: string,
  boundary: DeepMindUploadV1BetaFilesError["boundary"],
): DeepMindUploadV1BetaFilesResult {
  return {
    ok: false,
    error: { code, message, boundary, safeForRuntimeInspection: true, rawProviderFieldsExposed: false },
    events: ["deepmind.upload.v1beta.files.rejected"],
  };
}

function normalizeFile(file: DeepMindUploadFileDescriptor | undefined): DeepMindUploadFileEnvelope | undefined {
  const displayName = cleanDeepMindUploadText(file?.displayName);
  const mimeType = cleanDeepMindUploadText(file?.mimeType);

  if (file === undefined || displayName === undefined || mimeType === undefined) {
    return undefined;
  }

  return {
    displayName,
    mimeType,
    sizeBytes: file.sizeBytes,
    uri: cleanDeepMindUploadText(file.uri),
  };
}

export function planDeepMindUploadV1BetaFiles(
  request?: DeepMindUploadV1BetaFilesRequest,
): DeepMindUploadV1BetaFilesResult {
  if (request?.contract?.accepted === false) {
    return failure(
      "CONTRACT_REJECTED",
      request.contract.reason ?? "runtime contract surface rejected DeepMind/Gemini file upload",
      "contract",
    );
  }

  if (request?.governance?.accepted === false) {
    return failure(
      "GOVERNANCE_REJECTED",
      request.governance.reason ?? "runtime governance rejected DeepMind/Gemini file upload",
      "governance",
    );
  }

  if (request?.file === undefined) {
    return failure("MISSING_FILE", "DeepMind/Gemini upload v1beta files requires a file descriptor", "input");
  }

  if (cleanDeepMindUploadText(request.file.displayName) === undefined) {
    return failure("MISSING_DISPLAY_NAME", "DeepMind/Gemini upload file descriptor requires displayName", "input");
  }

  if (cleanDeepMindUploadText(request.file.mimeType) === undefined) {
    return failure("MISSING_MIME_TYPE", "DeepMind/Gemini upload file descriptor requires mimeType", "input");
  }

  if (
    request.file.sizeBytes !== undefined &&
    (!Number.isSafeInteger(request.file.sizeBytes) || request.file.sizeBytes < 0)
  ) {
    return failure("INVALID_FILE_SIZE", "DeepMind/Gemini upload file sizeBytes must be a non-negative safe integer", "input");
  }

  if (request.responseBody !== undefined && !isDeepMindUploadRecord(request.responseBody)) {
    return failure(
      "RESPONSE_FORMAT_DRIFT",
      "DeepMind/Gemini upload responseBody must be a plain record to be safely wrapped",
      "provider-response",
    );
  }

  const file = normalizeFile(request.file);
  if (file === undefined) {
    return failure("MISSING_FILE", "DeepMind/Gemini upload file descriptor could not be normalized", "input");
  }

  const authPresent = request.apiKeyPresent === true;

  return {
    ok: true,
    plan: {
      provider: "deepmind",
      endpointId: "upload.v1beta.files",
      endpointPath: "/upload/v1beta/files",
      method: "POST",
      uploadProtocol: request.uploadProtocol ?? "resumable",
      file,
      auth: {
        required: true,
        present: authPresent,
      },
      responseEnvelope:
        request.responseBody === undefined
          ? undefined
          : { retained: false, keyHints: Object.keys(request.responseBody).sort() },
      errorEnvelope: request.upstreamError === undefined ? undefined : classifyDeepMindUploadError(request.upstreamError),
      capabilitySignal: {
        capabilityId: "deepmind.upload.v1beta.files",
        supportsFileUpload: true,
        authRequired: true,
        usableByAbstractionLayer: authPresent,
      },
      metadata: request.metadata ?? {},
      trace: {
        correlationId: cleanDeepMindUploadText(request.trace?.correlationId),
        callerId: cleanDeepMindUploadText(request.trace?.callerId),
        source: cleanDeepMindUploadText(request.trace?.source),
      },
      providerCarrierHandoff: {
        target: "providerCarrierRegistry",
        mockable: true,
        networkCallStarted: false,
      },
      abstractionHandoff: {
        target: "agent_modelAdapter.abstractionLayer",
        rawProviderFieldsExposed: false,
      },
      audit: {
        plannedBy: "deepmind.upload_v1beta_files",
        dryRun: true,
        unsafeSideEffects: false,
      },
    },
    events: ["deepmind.upload.v1beta.files.planned"],
  };
}
