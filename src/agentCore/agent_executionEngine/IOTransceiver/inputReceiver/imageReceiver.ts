/*
 * 文件定位：Agent 执行引擎 / 输入输出收发层 / 输入接收面。
 * 核心目的：接收图像输入，并把图片、截图或视觉材料纳入一次 Agent 输入。
 * 能力要求1：需要区分原始图像、图像引用、视觉区域和上下文图片，不把它们直接压成文本。
 * 能力要求2：需要为后续视觉模型、工具调用或 PromptPack 上下文提供稳定输入结构。
 * 边界：只服务 agentCore 内核，不写上层产品逻辑。
 * 对接：需要被 runtime.execEngine 拉起，并和 mainLoop、stateEngine、事件暴露、工具调用策略接通。
 * 实现提示：先补稳定类型契约、最小可测行为和清晰错误边界，再接入真实执行逻辑。
 */

export type ImageReceiverSource = "user" | "application" | "runtime" | "official-module";

export type ImageReceiverBoundary = "input" | "contract" | "governance" | "scope" | "runtime-state";

export type ImageReceiverErrorCode =
  | "MISSING_RUNTIME_ID"
  | "MISSING_SESSION_ID"
  | "MISSING_IMAGE_PAYLOAD"
  | "INVALID_IMAGE_PAYLOAD"
  | "INVALID_VISUAL_REGION"
  | "RUNTIME_NOT_READY"
  | "CONTRACT_REJECTED"
  | "GOVERNANCE_REJECTED"
  | "SCOPE_DENIED";

export type ImageReceiverGate = {
  accepted: boolean;
  reason?: string;
};

export type ImageDimensions = {
  width?: number;
  height?: number;
};

export type VisualRegion = {
  x: number;
  y: number;
  width: number;
  height: number;
};

export type RawImageInput = {
  kind: "raw-image";
  bytes: Uint8Array | readonly number[];
  format: string;
  dimensions?: ImageDimensions;
};

export type ReferencedImageInput = {
  kind: "image-reference";
  uri: string;
  format?: string;
  dimensions?: ImageDimensions;
};

export type VisualRegionImageInput = {
  kind: "visual-region";
  imageId: string;
  region: VisualRegion;
  label?: string;
};

export type ContextImageInput = {
  kind: "context-image";
  contextId: string;
  label?: string;
  format?: string;
};

export type ImageReceiverPayload =
  | RawImageInput
  | ReferencedImageInput
  | VisualRegionImageInput
  | ContextImageInput;

export type ImageReceiverRequest = {
  runtimeId?: string;
  sessionId?: string;
  source?: ImageReceiverSource;
  payload?: ImageReceiverPayload;
  requestedScopes?: readonly string[];
  allowedScopes?: readonly string[];
  runtimeReady?: boolean;
  contract?: ImageReceiverGate;
  governance?: ImageReceiverGate;
};

export type ImageReceiverError = {
  code: ImageReceiverErrorCode;
  message: string;
  boundary: ImageReceiverBoundary;
  safeForRuntimeInspection: true;
};

export type ReceivedImageInput = {
  kind: "image";
  runtimeId: string;
  sessionId: string;
  source: ImageReceiverSource;
  payloadKind: ImageReceiverPayload["kind"];
  visualMaterial: {
    format?: string;
    byteLength?: number;
    uri?: string;
    imageId?: string;
    contextId?: string;
    dimensions?: ImageDimensions;
    region?: VisualRegion;
    label?: string;
  };
  promptPackHandoff: "pending";
  textFallbackCreated: false;
  providerPayloadCreated: false;
  unsafeSideEffects: false;
};

export type ImageReceiverResult =
  | {
      ok: true;
      input: ReceivedImageInput;
      events: readonly string[];
    }
  | {
      ok: false;
      error: ImageReceiverError;
      events: readonly string[];
    };

export const imageInputReceiverDescriptor = {
  modality: "image",
  route: "agent_executionEngine.IOTransceiver.inputReceiver",
  purpose: "preserve image material as visual input instead of flattening it into text",
  providerPayloadCreated: false,
  textFallbackCreated: false,
  unsafeSideEffects: false,
} as const;

function isBlank(value: string | undefined): boolean {
  return typeof value !== "string" || value.trim().length === 0;
}

function cleanList(values: readonly string[] | undefined): readonly string[] {
  return [...new Set((values ?? []).map((value) => value.trim()).filter(Boolean))];
}

function failure(code: ImageReceiverErrorCode, message: string, boundary: ImageReceiverBoundary): ImageReceiverResult {
  return {
    ok: false,
    error: { code, message, boundary, safeForRuntimeInspection: true },
    events: ["input.image.rejected"],
  };
}

function guardScopes(
  requestedScopes: readonly string[] | undefined,
  allowedScopes: readonly string[] | undefined,
): ImageReceiverResult | undefined {
  const requested = cleanList(requestedScopes);
  const allowed = cleanList(allowedScopes);

  if (requested.length === 0 || allowed.length === 0) {
    return undefined;
  }

  const denied = requested.find((scope) => !allowed.includes(scope));
  if (denied) {
    return failure("SCOPE_DENIED", `image input scope ${denied} is outside runtime governance`, "scope");
  }

  return undefined;
}

function validDimensions(dimensions: ImageDimensions | undefined): boolean {
  return (
    dimensions === undefined ||
    ((dimensions.width === undefined || (Number.isFinite(dimensions.width) && dimensions.width > 0)) &&
      (dimensions.height === undefined || (Number.isFinite(dimensions.height) && dimensions.height > 0)))
  );
}

function validRegion(region: VisualRegion): boolean {
  return (
    Number.isFinite(region.x) &&
    Number.isFinite(region.y) &&
    Number.isFinite(region.width) &&
    Number.isFinite(region.height) &&
    region.width > 0 &&
    region.height > 0
  );
}

function normalizeImagePayload(
  payload: ImageReceiverPayload,
): ReceivedImageInput["visualMaterial"] | ImageReceiverResult {
  if (payload.kind === "raw-image") {
    if (payload.bytes.length === 0 || isBlank(payload.format) || !validDimensions(payload.dimensions)) {
      return failure("INVALID_IMAGE_PAYLOAD", "raw image requires non-empty bytes, format, and valid dimensions", "input");
    }

    return {
      format: payload.format.trim(),
      byteLength: payload.bytes.length,
      dimensions: payload.dimensions,
    };
  }

  if (payload.kind === "image-reference") {
    if (isBlank(payload.uri) || !validDimensions(payload.dimensions)) {
      return failure("INVALID_IMAGE_PAYLOAD", "image reference requires a uri and valid dimensions", "input");
    }

    return {
      uri: payload.uri.trim(),
      format: payload.format?.trim() || undefined,
      dimensions: payload.dimensions,
    };
  }

  if (payload.kind === "visual-region") {
    if (isBlank(payload.imageId) || !validRegion(payload.region)) {
      return failure("INVALID_VISUAL_REGION", "visual region requires imageId and a positive rectangular region", "input");
    }

    return {
      imageId: payload.imageId.trim(),
      region: payload.region,
      label: payload.label?.trim() || undefined,
    };
  }

  if (isBlank(payload.contextId)) {
    return failure("INVALID_IMAGE_PAYLOAD", "context image requires contextId", "input");
  }

  return {
    contextId: payload.contextId.trim(),
    label: payload.label?.trim() || undefined,
    format: payload.format?.trim() || undefined,
  };
}

export function receiveImageInput(request?: ImageReceiverRequest): ImageReceiverResult {
  if (request === undefined || isBlank(request.runtimeId)) {
    return failure("MISSING_RUNTIME_ID", "runtimeId is required before receiving image input", "input");
  }

  if (isBlank(request.sessionId)) {
    return failure("MISSING_SESSION_ID", "sessionId is required before receiving image input", "input");
  }

  if (request.runtimeReady === false) {
    return failure("RUNTIME_NOT_READY", "image input can only be accepted by a ready runtime", "runtime-state");
  }

  if (request.contract?.accepted === false) {
    return failure(
      "CONTRACT_REJECTED",
      request.contract.reason ?? "image input was rejected by runtime contract surface",
      "contract",
    );
  }

  if (request.governance?.accepted === false) {
    return failure(
      "GOVERNANCE_REJECTED",
      request.governance.reason ?? "image input was rejected by runtime governance",
      "governance",
    );
  }

  const scopeFailure = guardScopes(request.requestedScopes, request.allowedScopes);
  if (scopeFailure) {
    return scopeFailure;
  }

  if (request.payload === undefined) {
    return failure("MISSING_IMAGE_PAYLOAD", "image input requires raw, referenced, region, or context material", "input");
  }

  const visualMaterial = normalizeImagePayload(request.payload);
  if ("ok" in visualMaterial) {
    return visualMaterial;
  }

  const runtimeId = request.runtimeId?.trim() ?? "";
  const sessionId = request.sessionId?.trim() ?? "";

  return {
    ok: true,
    input: {
      kind: "image",
      runtimeId,
      sessionId,
      source: request.source ?? "user",
      payloadKind: request.payload.kind,
      visualMaterial,
      promptPackHandoff: "pending",
      textFallbackCreated: false,
      providerPayloadCreated: false,
      unsafeSideEffects: false,
    },
    events: ["input.image.received"],
  };
}
