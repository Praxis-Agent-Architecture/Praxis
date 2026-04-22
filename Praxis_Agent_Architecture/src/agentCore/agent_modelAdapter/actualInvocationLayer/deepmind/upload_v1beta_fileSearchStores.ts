/*
 * 文件定位：Agent 模型适配层 / 真实上游调用层 / DeepMind/Gemini 官方调用面。
 * 核心目的：承接 DeepMind/Gemini 上游的 upload v1beta file Search Stores 真实调用面。
 * 能力要求1：需要把对应 endpoint 的请求参数、响应形态、错误形态和能力信号整理成可适配对象。
 * 能力要求2：鉴权/API 登录后续会接入，但这里要为“上游能力变得实际可用”预留位置。
 * 能力要求3：不把该 provider 的字段形状提升为 Praxis 统一语义，只作为 actualInvocationLayer 的现实入口。
 * 边界：只处理上游实际调用面，不在这里定义 agentCore 使用 AI 的统一方式。
 * 对接：需要被 runtime.modelAdapter 拉起，并和 provider/carrier、PromptPack lowering、能力抽象链路接通。
 * 实现提示：先补稳定类型契约、最小可测行为和清晰错误边界，再接入真实执行逻辑。
 */

import {
  type DeepMindUploadBoundary,
  type DeepMindUploadFileDescriptor,
  type DeepMindUploadFileEnvelope,
  type DeepMindUploadGate,
  type DeepMindUploadProviderError,
  type DeepMindUploadProtocol,
  type DeepMindUploadTrace,
  classifyDeepMindUploadError,
  cleanDeepMindUploadText,
  isDeepMindUploadRecord,
} from "./upload_v1beta_files.js";

export type DeepMindUploadV1BetaFileSearchStoresRequest = {
  fileSearchStoreName?: string;
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

export type DeepMindUploadV1BetaFileSearchStoresPlan = {
  provider: "deepmind";
  endpointId: "upload.v1beta.fileSearchStores";
  endpointTemplate: "/upload/v1beta/fileSearchStores/{fileSearchStoreName}:upload";
  method: "POST";
  fileSearchStoreName: string;
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
    capabilityId: "deepmind.upload.v1beta.fileSearchStores";
    supportsFileSearchStoreUpload: true;
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
    plannedBy: "deepmind.upload_v1beta_fileSearchStores";
    dryRun: true;
    unsafeSideEffects: false;
  };
};

export type DeepMindUploadV1BetaFileSearchStoresErrorCode =
  | "MISSING_FILE_SEARCH_STORE_NAME"
  | "MISSING_FILE"
  | "MISSING_DISPLAY_NAME"
  | "MISSING_MIME_TYPE"
  | "INVALID_FILE_SIZE"
  | "RESPONSE_FORMAT_DRIFT"
  | "CONTRACT_REJECTED"
  | "GOVERNANCE_REJECTED";

export type DeepMindUploadV1BetaFileSearchStoresError = {
  code: DeepMindUploadV1BetaFileSearchStoresErrorCode;
  message: string;
  boundary: DeepMindUploadBoundary | "provider-response";
  safeForRuntimeInspection: true;
  rawProviderFieldsExposed: false;
};

export type DeepMindUploadV1BetaFileSearchStoresResult =
  | {
      ok: true;
      plan: DeepMindUploadV1BetaFileSearchStoresPlan;
      events: readonly string[];
    }
  | {
      ok: false;
      error: DeepMindUploadV1BetaFileSearchStoresError;
      events: readonly string[];
    };

export const deepMindUploadV1BetaFileSearchStoresDescriptor = {
  layer: "agent_modelAdapter.actualInvocationLayer.deepmind",
  capability: "deepmind.upload.v1beta.fileSearchStores",
  endpointTemplate: "/upload/v1beta/fileSearchStores/{fileSearchStoreName}:upload",
  dryRun: true,
  unsafeSideEffects: false,
  providerFieldsPromotedToPraxisContract: false,
} as const;

function failure(
  code: DeepMindUploadV1BetaFileSearchStoresErrorCode,
  message: string,
  boundary: DeepMindUploadV1BetaFileSearchStoresError["boundary"],
): DeepMindUploadV1BetaFileSearchStoresResult {
  return {
    ok: false,
    error: { code, message, boundary, safeForRuntimeInspection: true, rawProviderFieldsExposed: false },
    events: ["deepmind.upload.v1beta.fileSearchStores.rejected"],
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

export function planDeepMindUploadV1BetaFileSearchStores(
  request?: DeepMindUploadV1BetaFileSearchStoresRequest,
): DeepMindUploadV1BetaFileSearchStoresResult {
  const fileSearchStoreName = cleanDeepMindUploadText(request?.fileSearchStoreName);

  if (fileSearchStoreName === undefined) {
    return failure(
      "MISSING_FILE_SEARCH_STORE_NAME",
      "DeepMind/Gemini upload v1beta fileSearchStores requires fileSearchStoreName",
      "input",
    );
  }

  if (request?.contract?.accepted === false) {
    return failure(
      "CONTRACT_REJECTED",
      request.contract.reason ?? "runtime contract surface rejected DeepMind/Gemini file search store upload",
      "contract",
    );
  }

  if (request?.governance?.accepted === false) {
    return failure(
      "GOVERNANCE_REJECTED",
      request.governance.reason ?? "runtime governance rejected DeepMind/Gemini file search store upload",
      "governance",
    );
  }

  if (request?.file === undefined) {
    return failure(
      "MISSING_FILE",
      "DeepMind/Gemini upload v1beta fileSearchStores requires a file descriptor",
      "input",
    );
  }

  if (cleanDeepMindUploadText(request.file.displayName) === undefined) {
    return failure("MISSING_DISPLAY_NAME", "DeepMind/Gemini file search store upload requires displayName", "input");
  }

  if (cleanDeepMindUploadText(request.file.mimeType) === undefined) {
    return failure("MISSING_MIME_TYPE", "DeepMind/Gemini file search store upload requires mimeType", "input");
  }

  if (
    request.file.sizeBytes !== undefined &&
    (!Number.isSafeInteger(request.file.sizeBytes) || request.file.sizeBytes < 0)
  ) {
    return failure(
      "INVALID_FILE_SIZE",
      "DeepMind/Gemini file search store upload sizeBytes must be a non-negative safe integer",
      "input",
    );
  }

  if (request.responseBody !== undefined && !isDeepMindUploadRecord(request.responseBody)) {
    return failure(
      "RESPONSE_FORMAT_DRIFT",
      "DeepMind/Gemini file search store upload responseBody must be a plain record to be safely wrapped",
      "provider-response",
    );
  }

  const file = normalizeFile(request.file);
  if (file === undefined) {
    return failure("MISSING_FILE", "DeepMind/Gemini file search store upload descriptor could not be normalized", "input");
  }

  const authPresent = request.apiKeyPresent === true;

  return {
    ok: true,
    plan: {
      provider: "deepmind",
      endpointId: "upload.v1beta.fileSearchStores",
      endpointTemplate: "/upload/v1beta/fileSearchStores/{fileSearchStoreName}:upload",
      method: "POST",
      fileSearchStoreName,
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
        capabilityId: "deepmind.upload.v1beta.fileSearchStores",
        supportsFileSearchStoreUpload: true,
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
        plannedBy: "deepmind.upload_v1beta_fileSearchStores",
        dryRun: true,
        unsafeSideEffects: false,
      },
    },
    events: ["deepmind.upload.v1beta.fileSearchStores.planned"],
  };
}
