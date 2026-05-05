/*
 * 文件定位：Agent 执行引擎 / 输入输出收发层 / 输出暴露面。
 * 核心目的：暴露文本输出能力，是 Agent 回复、解释、结构化结果和错误信息的主要出口。
 * 能力要求1：需要支持普通文本、结构化片段、阶段性输出和最终输出。
 * 能力要求2：需要和事件暴露面、应用订阅面保持一致。
 * 边界：只服务 agentCore 内核，不写上层产品逻辑。
 * 对接：需要被 runtime.execEngine 拉起，并和 mainLoop、stateEngine、事件暴露、工具调用策略接通。
 * 实现提示：先补稳定类型契约、最小可测行为和清晰错误边界，再接入真实执行逻辑。
 */

export type OutputExposureBoundary = "input" | "contract" | "governance" | "scope";

export type OutputExposureErrorCode =
  | "MISSING_OUTPUT_ID"
  | "MISSING_SESSION_ID"
  | "MISSING_PAYLOAD"
  | "INVALID_PAYLOAD"
  | "CONTRACT_REJECTED"
  | "GOVERNANCE_REJECTED"
  | "SCOPE_DENIED";

export type OutputExposureGate = {
  accepted: boolean;
  reason?: string;
};

export type OutputExposureError = {
  code: OutputExposureErrorCode;
  message: string;
  boundary: OutputExposureBoundary;
  publicSafe: true;
};

export type OutputExposureMode = "single" | "stream" | "multimodal";

export type OutputExposureStage = "partial" | "final" | "diagnostic";

export type OutputExposureVisibility = "application" | "runtime-event" | "subscriber";

export type OutputExposureContext = {
  runtimeId?: string;
  sessionId: string;
  turnId?: string;
  source?: "model" | "tool" | "execution-engine" | "event";
};

export type OutputExposureRequestBase = {
  outputId?: string;
  sessionId?: string;
  runtimeId?: string;
  turnId?: string;
  source?: OutputExposureContext["source"];
  mode?: OutputExposureMode;
  stage?: OutputExposureStage;
  visibility?: OutputExposureVisibility;
  streamId?: string;
  sequence?: number;
  requestedScopes?: readonly string[];
  allowedScopes?: readonly string[];
  events?: readonly string[];
  metadata?: Readonly<Record<string, unknown>>;
  contract?: OutputExposureGate;
  governance?: OutputExposureGate;
};

export type OutputExposureEnvelope<TModality extends string, TPayload> = {
  outputId: string;
  modality: TModality;
  context: OutputExposureContext;
  payload: TPayload;
  mode: OutputExposureMode;
  stage: OutputExposureStage;
  visibility: OutputExposureVisibility;
  streamId?: string;
  sequence?: number;
  scopes: readonly string[];
  events: readonly string[];
  metadata: Readonly<Record<string, unknown>>;
  dispatch: "dry-run";
  providerRawShapeExposed: false;
};

export type OutputExposureResult<TModality extends string, TPayload> =
  | {
      ok: true;
      exposed: OutputExposureEnvelope<TModality, TPayload>;
      events: readonly string[];
    }
  | {
      ok: false;
      error: OutputExposureError;
      events: readonly string[];
    };

export type TextOutputKind = "plain" | "structured" | "status" | "error";

export type TextOutputPayload = {
  kind: TextOutputKind;
  text?: string;
  structured?: unknown;
  error?: {
    code: string;
    message: string;
  };
};

export type TextOutputExposureRequest = OutputExposureRequestBase & {
  text?: string;
  structured?: unknown;
  error?: {
    code?: string;
    message?: string;
  };
  kind?: TextOutputKind;
};

export type TextOutputExposureResult = OutputExposureResult<"text", TextOutputPayload>;

export function hasOutputText(value: string | undefined): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

export function uniqueOutputStrings(values: readonly string[] | undefined): readonly string[] {
  return [...new Set((values ?? []).map((value) => value.trim()).filter(Boolean))];
}

export function hasOutputScopeAccess(
  requestedScopes: readonly string[] | undefined,
  allowedScopes: readonly string[] | undefined,
): boolean {
  const requested = uniqueOutputStrings(requestedScopes);
  if (requested.length === 0) {
    return true;
  }

  const allowed = new Set(uniqueOutputStrings(allowedScopes));
  return requested.every((scope) => allowed.has(scope));
}

export function createOutputExposureError(
  code: OutputExposureErrorCode,
  message: string,
  boundary: OutputExposureBoundary,
): OutputExposureError {
  return { code, message, boundary, publicSafe: true };
}

export function rejectOutputExposure<TModality extends string, TPayload>(
  code: OutputExposureErrorCode,
  message: string,
  boundary: OutputExposureBoundary,
  modality: TModality,
): OutputExposureResult<TModality, TPayload> {
  return {
    ok: false,
    error: createOutputExposureError(code, message, boundary),
    events: [`output.${modality}.exposure.rejected`],
  };
}

export function validateOutputExposureBase<TModality extends string, TPayload>(
  request: OutputExposureRequestBase | undefined,
  modality: TModality,
): OutputExposureResult<TModality, TPayload> | undefined {
  if (request === undefined || !hasOutputText(request.outputId)) {
    return rejectOutputExposure("MISSING_OUTPUT_ID", `${modality} output exposure requires an outputId`, "input", modality);
  }

  if (!hasOutputText(request.sessionId)) {
    return rejectOutputExposure(
      "MISSING_SESSION_ID",
      `${modality} output exposure requires a sessionId`,
      "input",
      modality,
    );
  }

  if (request.contract?.accepted === false) {
    return rejectOutputExposure(
      "CONTRACT_REJECTED",
      request.contract.reason ?? `${modality} output was rejected by contract surface`,
      "contract",
      modality,
    );
  }

  if (request.governance?.accepted === false) {
    return rejectOutputExposure(
      "GOVERNANCE_REJECTED",
      request.governance.reason ?? `${modality} output was rejected by governance`,
      "governance",
      modality,
    );
  }

  if (!hasOutputScopeAccess(request.requestedScopes, request.allowedScopes)) {
    return rejectOutputExposure(
      "SCOPE_DENIED",
      `${modality} output requested scopes outside the allowed exposure boundary`,
      "scope",
      modality,
    );
  }

  return undefined;
}

export function createOutputExposureEnvelope<TModality extends string, TPayload>(
  request: OutputExposureRequestBase,
  modality: TModality,
  payload: TPayload,
): OutputExposureEnvelope<TModality, TPayload> {
  return {
    outputId: request.outputId?.trim() ?? "",
    modality,
    context: {
      runtimeId: request.runtimeId?.trim() || undefined,
      sessionId: request.sessionId?.trim() ?? "",
      turnId: request.turnId?.trim() || undefined,
      source: request.source ?? "execution-engine",
    },
    payload,
    mode: request.mode ?? (request.streamId === undefined ? "single" : "stream"),
    stage: request.stage ?? "final",
    visibility: request.visibility ?? "application",
    streamId: request.streamId?.trim() || undefined,
    sequence: request.sequence,
    scopes: uniqueOutputStrings(request.requestedScopes),
    events: [...new Set([...(request.events ?? []), `output.${modality}.exposed`])],
    metadata: request.metadata ?? {},
    dispatch: "dry-run",
    providerRawShapeExposed: false,
  };
}

function normalizeTextPayload(request: TextOutputExposureRequest): TextOutputPayload | undefined {
  const text = request.text?.trim();
  const errorCode = request.error?.code?.trim();
  const errorMessage = request.error?.message?.trim();

  if (hasOutputText(errorCode) || hasOutputText(errorMessage)) {
    if (!hasOutputText(errorCode) || !hasOutputText(errorMessage)) {
      return undefined;
    }

    return {
      kind: "error",
      error: {
        code: errorCode,
        message: errorMessage,
      },
    };
  }

  if (request.structured !== undefined) {
    return {
      kind: request.kind ?? "structured",
      text: hasOutputText(text) ? text : undefined,
      structured: request.structured,
    };
  }

  if (hasOutputText(text)) {
    return {
      kind: request.kind ?? "plain",
      text,
    };
  }

  return undefined;
}

export function exposeTextOutput(request?: TextOutputExposureRequest): TextOutputExposureResult {
  const baseFailure = validateOutputExposureBase<"text", TextOutputPayload>(request, "text");
  if (baseFailure !== undefined) {
    return baseFailure;
  }

  const safeRequest = request;
  if (safeRequest === undefined) {
    return rejectOutputExposure("MISSING_OUTPUT_ID", "text output exposure requires an outputId", "input", "text");
  }

  const payload = normalizeTextPayload(safeRequest);
  if (payload === undefined) {
    return rejectOutputExposure(
      "MISSING_PAYLOAD",
      "text output exposure requires text, structured output, or error detail",
      "input",
      "text",
    );
  }

  if (payload.kind === "error" && payload.error === undefined) {
    return rejectOutputExposure("INVALID_PAYLOAD", "text error outputs require a classified error payload", "input", "text");
  }

  return {
    ok: true,
    exposed: createOutputExposureEnvelope(safeRequest, "text", payload),
    events: ["output.text.exposure.ready"],
  };
}
