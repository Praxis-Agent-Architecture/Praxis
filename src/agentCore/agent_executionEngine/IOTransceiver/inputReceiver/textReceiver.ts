/*
 * 文件定位：Agent 执行引擎 / 输入输出收发层 / 输入接收面。
 * 核心目的：接收文本输入，是一次普通 Agent 任务、对话请求或应用调用的入口。
 * 能力要求1：需要保留用户原始意图、调用来源、会话上下文和输入边界。
 * 能力要求2：需要把文本输入交给 PromptPack、状态机和主循环，而不是直接绑定某家模型请求格式。
 * 边界：只服务 agentCore 内核，不写上层产品逻辑。
 * 对接：需要被 runtime.execEngine 拉起，并和 mainLoop、stateEngine、事件暴露、工具调用策略接通。
 * 实现提示：先补稳定类型契约、最小可测行为和清晰错误边界，再接入真实执行逻辑。
 */

export type TextReceiverSource = "user" | "application" | "runtime" | "official-module";

export type TextReceiverBoundary = "input" | "contract" | "governance" | "scope" | "runtime-state";

export type TextReceiverErrorCode =
  | "MISSING_RUNTIME_ID"
  | "MISSING_SESSION_ID"
  | "EMPTY_TEXT"
  | "TEXT_TOO_SHORT"
  | "TEXT_TOO_LONG"
  | "RUNTIME_NOT_READY"
  | "CONTRACT_REJECTED"
  | "GOVERNANCE_REJECTED"
  | "SCOPE_DENIED";

export type TextReceiverGate = {
  accepted: boolean;
  reason?: string;
};

export type TextInputBoundary = {
  minCharacters?: number;
  maxCharacters?: number;
};

export type TextReceiverRequest = {
  runtimeId?: string;
  sessionId?: string;
  source?: TextReceiverSource;
  text?: string;
  contextRefs?: readonly string[];
  requestedScopes?: readonly string[];
  allowedScopes?: readonly string[];
  inputBoundary?: TextInputBoundary;
  runtimeReady?: boolean;
  contract?: TextReceiverGate;
  governance?: TextReceiverGate;
};

export type TextReceiverError = {
  code: TextReceiverErrorCode;
  message: string;
  boundary: TextReceiverBoundary;
  safeForRuntimeInspection: true;
};

export type ReceivedTextInput = {
  kind: "text";
  runtimeId: string;
  sessionId: string;
  source: TextReceiverSource;
  rawText: string;
  normalizedText: string;
  contextRefs: readonly string[];
  promptPackHandoff: "pending";
  providerPayloadCreated: false;
  inputBoundary: {
    actualCharacters: number;
    minCharacters?: number;
    maxCharacters?: number;
  };
  governanceRequired: true;
  unsafeSideEffects: false;
};

export type TextReceiverResult =
  | {
      ok: true;
      input: ReceivedTextInput;
      events: readonly string[];
    }
  | {
      ok: false;
      error: TextReceiverError;
      events: readonly string[];
    };

export const textInputReceiverDescriptor = {
  modality: "text",
  route: "agent_executionEngine.IOTransceiver.inputReceiver",
  purpose: "normalize external text intent for PromptPack, stateEngine, and mainLoop handoff",
  providerPayloadCreated: false,
  unsafeSideEffects: false,
} as const;

function isBlank(value: string | undefined): boolean {
  return typeof value !== "string" || value.trim().length === 0;
}

function cleanList(values: readonly string[] | undefined): readonly string[] {
  return [...new Set((values ?? []).map((value) => value.trim()).filter(Boolean))];
}

function failure(code: TextReceiverErrorCode, message: string, boundary: TextReceiverBoundary): TextReceiverResult {
  return {
    ok: false,
    error: { code, message, boundary, safeForRuntimeInspection: true },
    events: ["input.text.rejected"],
  };
}

function guardScopes(
  requestedScopes: readonly string[] | undefined,
  allowedScopes: readonly string[] | undefined,
): TextReceiverResult | undefined {
  const requested = cleanList(requestedScopes);
  const allowed = cleanList(allowedScopes);

  if (requested.length === 0 || allowed.length === 0) {
    return undefined;
  }

  const denied = requested.find((scope) => !allowed.includes(scope));
  if (denied) {
    return failure("SCOPE_DENIED", `text input scope ${denied} is outside runtime governance`, "scope");
  }

  return undefined;
}

export function receiveTextInput(request?: TextReceiverRequest): TextReceiverResult {
  if (request === undefined || isBlank(request.runtimeId)) {
    return failure("MISSING_RUNTIME_ID", "runtimeId is required before receiving text input", "input");
  }

  if (isBlank(request.sessionId)) {
    return failure("MISSING_SESSION_ID", "sessionId is required before receiving text input", "input");
  }

  if (request.runtimeReady === false) {
    return failure("RUNTIME_NOT_READY", "text input can only be accepted by a ready runtime", "runtime-state");
  }

  if (request.contract?.accepted === false) {
    return failure(
      "CONTRACT_REJECTED",
      request.contract.reason ?? "text input was rejected by runtime contract surface",
      "contract",
    );
  }

  if (request.governance?.accepted === false) {
    return failure(
      "GOVERNANCE_REJECTED",
      request.governance.reason ?? "text input was rejected by runtime governance",
      "governance",
    );
  }

  const scopeFailure = guardScopes(request.requestedScopes, request.allowedScopes);
  if (scopeFailure) {
    return scopeFailure;
  }

  const rawText = request.text ?? "";
  const normalizedText = rawText.trim();
  if (normalizedText.length === 0) {
    return failure("EMPTY_TEXT", "text input must contain a non-empty user intent", "input");
  }

  const minCharacters = request.inputBoundary?.minCharacters;
  if (minCharacters !== undefined && normalizedText.length < minCharacters) {
    return failure("TEXT_TOO_SHORT", `text input must contain at least ${minCharacters} characters`, "input");
  }

  const maxCharacters = request.inputBoundary?.maxCharacters;
  if (maxCharacters !== undefined && normalizedText.length > maxCharacters) {
    return failure("TEXT_TOO_LONG", `text input must contain no more than ${maxCharacters} characters`, "input");
  }

  const runtimeId = request.runtimeId?.trim() ?? "";
  const sessionId = request.sessionId?.trim() ?? "";

  return {
    ok: true,
    input: {
      kind: "text",
      runtimeId,
      sessionId,
      source: request.source ?? "user",
      rawText,
      normalizedText,
      contextRefs: cleanList(request.contextRefs),
      promptPackHandoff: "pending",
      providerPayloadCreated: false,
      inputBoundary: {
        actualCharacters: normalizedText.length,
        minCharacters,
        maxCharacters,
      },
      governanceRequired: true,
      unsafeSideEffects: false,
    },
    events: ["input.text.received"],
  };
}
