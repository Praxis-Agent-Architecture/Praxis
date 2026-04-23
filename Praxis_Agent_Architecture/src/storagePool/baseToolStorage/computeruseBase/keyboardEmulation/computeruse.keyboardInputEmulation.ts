/*
 * 文件定位：Agent 执行引擎 / 基础工具原语层 / 基础工具集合 / 计算机使用基础工具 / 键盘模拟。
 * 核心目的：提供 计算机使用基础工具 / 键盘模拟 中的“模拟键盘输入”基础能力原语。
 * 能力要求1：需要定义该能力的输入、输出、错误、权限需求和可观测事件。
 * 能力要求2：这些基础工具是 Agent 成立的底层能力，不是 TAP 的最终高级工具库。
 * 能力要求3：后续 TAP 可以基于这些原语构建更强的工具编排、审批、替换和专业能力库。
 * 边界：保留 Agent 基础工具原语，不替代 TAP 的高级工具系统。
 * 对接：需要被 runtime.execEngine 拉起，并和 mainLoop、stateEngine、事件暴露、工具调用策略接通。
 * 实现提示：先补稳定类型契约、最小可测行为和清晰错误边界，再接入真实执行逻辑。
 */

export type KeyboardInputEmulationBoundary = "input" | "contract" | "governance" | "scope" | "resource";

export type KeyboardInputEmulationGate = {
  accepted: boolean;
  reason?: string;
};

export type KeyboardInputMode = "text" | "paste" | "key-sequence";

export type KeyboardInputEmulationRequest = {
  runtimeId?: string;
  sessionId?: string;
  invocationId?: string;
  text?: string;
  inputMode?: KeyboardInputMode;
  targetHint?: string;
  maxTextLength?: number;
  requestedScopes?: readonly string[];
  allowedScopes?: readonly string[];
  dryRun?: boolean;
  contract?: KeyboardInputEmulationGate;
  governance?: KeyboardInputEmulationGate;
  metadata?: Readonly<Record<string, unknown>>;
};

export type KeyboardInputEmulationErrorCode =
  | "MISSING_TEXT"
  | "INVALID_TEXT_LIMIT"
  | "TEXT_LIMIT_EXCEEDED"
  | "CONTRACT_REJECTED"
  | "GOVERNANCE_REJECTED"
  | "SCOPE_DENIED"
  | "REAL_SIDE_EFFECT_NOT_ALLOWED";

export type KeyboardInputEmulationError = {
  code: KeyboardInputEmulationErrorCode;
  message: string;
  boundary: KeyboardInputEmulationBoundary;
  safeForRuntimeInspection: true;
  internalDetailExposed: false;
};

export type KeyboardInputEmulationPlan = {
  tool: "computeruse.keyboardInputEmulation";
  capability: "keyboard-input-emulation";
  runtimeId?: string;
  sessionId?: string;
  invocationId?: string;
  inputMode: KeyboardInputMode;
  targetHint?: string;
  textCharacters: number;
  textBytes: number;
  requiredPermission: "desktop:keyboard-input";
  requiresTapApproval: true;
  dispatch: "dry-run";
  dryRun: true;
  wouldType: true;
  unsafeSideEffects: false;
  acceptedScopes: readonly string[];
  audit: {
    guard: "keyboard-input-dry-run-and-scope";
    event: "basicTool.computeruse.keyboardInputEmulation.planned";
    metadata: Readonly<Record<string, unknown>>;
  };
};

export type KeyboardInputEmulationResult =
  | {
      ok: true;
      plan: KeyboardInputEmulationPlan;
      events: readonly string[];
    }
  | {
      ok: false;
      error: KeyboardInputEmulationError;
      events: readonly string[];
    };

export const keyboardInputEmulationDescriptor = {
  tool: "computeruse.keyboardInputEmulation",
  capability: "keyboard-input-emulation",
  layer: "agent_executionEngine.basic_toolLayer.baseTools.computeruseBase.keyboardEmulation",
  defaultDispatch: "dry-run",
  requiresTapApproval: true,
  unsafeSideEffects: false,
} as const;

const defaultMaxTextLength = 4096;

function isBlank(value: string | undefined): boolean {
  return typeof value !== "string" || value.trim().length === 0;
}

function cleanList(values: readonly string[] | undefined): string[] {
  return [...new Set((values ?? []).map((value) => value.trim()).filter(Boolean))];
}

function byteLength(value: string): number {
  return new TextEncoder().encode(value).length;
}

function failure(
  code: KeyboardInputEmulationErrorCode,
  message: string,
  boundary: KeyboardInputEmulationBoundary,
): KeyboardInputEmulationResult {
  return {
    ok: false,
    error: {
      code,
      message,
      boundary,
      safeForRuntimeInspection: true,
      internalDetailExposed: false,
    },
    events: ["basicTool.computeruse.keyboardInputEmulation.rejected"],
  };
}

function resolveScopes(
  requestedScopes: readonly string[] | undefined,
  allowedScopes: readonly string[] | undefined,
): string[] | KeyboardInputEmulationResult {
  const requested = cleanList(requestedScopes);
  const allowed = cleanList(allowedScopes);

  if (requested.length === 0) {
    return [];
  }

  const denied = requested.filter((scope) => !allowed.includes(scope));
  if (denied.length > 0) {
    return failure(
      "SCOPE_DENIED",
      `keyboard input emulation scope ${denied[0]} is outside runtime governance`,
      "scope",
    );
  }

  return requested;
}

export function planKeyboardInputEmulation(
  request: KeyboardInputEmulationRequest = {},
): KeyboardInputEmulationResult {
  if (isBlank(request.text)) {
    return failure("MISSING_TEXT", "keyboard input emulation requires non-empty text", "input");
  }

  const maxTextLength = request.maxTextLength ?? defaultMaxTextLength;
  if (!Number.isInteger(maxTextLength) || maxTextLength < 1) {
    return failure("INVALID_TEXT_LIMIT", "keyboard input emulation maxTextLength must be a positive integer", "input");
  }

  const text = request.text ?? "";
  if (text.length > maxTextLength) {
    return failure(
      "TEXT_LIMIT_EXCEEDED",
      "keyboard input emulation text exceeds the configured resource boundary",
      "resource",
    );
  }

  if (request.dryRun === false) {
    return failure(
      "REAL_SIDE_EFFECT_NOT_ALLOWED",
      "first-round keyboard input emulation only returns a dry-run plan",
      "governance",
    );
  }

  if (request.contract?.accepted === false) {
    return failure(
      "CONTRACT_REJECTED",
      request.contract.reason ?? "keyboard input emulation was rejected by runtime contract surface",
      "contract",
    );
  }

  if (request.governance?.accepted === false) {
    return failure(
      "GOVERNANCE_REJECTED",
      request.governance.reason ?? "keyboard input emulation was rejected by runtime governance",
      "governance",
    );
  }

  const acceptedScopes = resolveScopes(request.requestedScopes, request.allowedScopes);
  if (!Array.isArray(acceptedScopes)) {
    return acceptedScopes;
  }

  return {
    ok: true,
    plan: {
      tool: "computeruse.keyboardInputEmulation",
      capability: "keyboard-input-emulation",
      runtimeId: request.runtimeId?.trim() || undefined,
      sessionId: request.sessionId?.trim() || undefined,
      invocationId: request.invocationId?.trim() || undefined,
      inputMode: request.inputMode ?? "text",
      targetHint: request.targetHint?.trim() || undefined,
      textCharacters: text.length,
      textBytes: byteLength(text),
      requiredPermission: "desktop:keyboard-input",
      requiresTapApproval: true,
      dispatch: "dry-run",
      dryRun: true,
      wouldType: true,
      unsafeSideEffects: false,
      acceptedScopes,
      audit: {
        guard: "keyboard-input-dry-run-and-scope",
        event: "basicTool.computeruse.keyboardInputEmulation.planned",
        metadata: request.metadata ?? {},
      },
    },
    events: ["basicTool.computeruse.keyboardInputEmulation.planned"],
  };
}
