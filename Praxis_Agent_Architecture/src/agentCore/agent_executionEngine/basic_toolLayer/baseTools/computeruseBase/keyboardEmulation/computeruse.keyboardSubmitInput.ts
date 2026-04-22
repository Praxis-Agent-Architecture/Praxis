/*
 * 文件定位：Agent 执行引擎 / 基础工具原语层 / 基础工具集合 / 计算机使用基础工具 / 键盘模拟。
 * 核心目的：提供 计算机使用基础工具 / 键盘模拟 中的“提交键盘输入”基础能力原语。
 * 能力要求1：需要定义该能力的输入、输出、错误、权限需求和可观测事件。
 * 能力要求2：这些基础工具是 Agent 成立的底层能力，不是 TAP 的最终高级工具库。
 * 能力要求3：后续 TAP 可以基于这些原语构建更强的工具编排、审批、替换和专业能力库。
 * 边界：保留 Agent 基础工具原语，不替代 TAP 的高级工具系统。
 * 对接：需要被 runtime.execEngine 拉起，并和 mainLoop、stateEngine、事件暴露、工具调用策略接通。
 * 实现提示：先补稳定类型契约、最小可测行为和清晰错误边界，再接入真实执行逻辑。
 */

export type KeyboardSubmitInputBoundary = "input" | "contract" | "governance" | "scope" | "resource";

export type KeyboardSubmitInputGate = {
  accepted: boolean;
  reason?: string;
};

export type KeyboardSubmitKey = "Enter" | "NumpadEnter";

export type KeyboardSubmitInputRequest = {
  runtimeId?: string;
  sessionId?: string;
  invocationId?: string;
  submitKey?: KeyboardSubmitKey;
  targetHint?: string;
  repeat?: number;
  requestedScopes?: readonly string[];
  allowedScopes?: readonly string[];
  dryRun?: boolean;
  contract?: KeyboardSubmitInputGate;
  governance?: KeyboardSubmitInputGate;
  metadata?: Readonly<Record<string, unknown>>;
};

export type KeyboardSubmitInputErrorCode =
  | "INVALID_REPEAT"
  | "CONTRACT_REJECTED"
  | "GOVERNANCE_REJECTED"
  | "SCOPE_DENIED"
  | "REAL_SIDE_EFFECT_NOT_ALLOWED";

export type KeyboardSubmitInputError = {
  code: KeyboardSubmitInputErrorCode;
  message: string;
  boundary: KeyboardSubmitInputBoundary;
  safeForRuntimeInspection: true;
  internalDetailExposed: false;
};

export type KeyboardSubmitInputPlan = {
  tool: "computeruse.keyboardSubmitInput";
  capability: "keyboard-submit-input";
  runtimeId?: string;
  sessionId?: string;
  invocationId?: string;
  submitKey: KeyboardSubmitKey;
  targetHint?: string;
  repeat: number;
  requiredPermission: "desktop:keyboard-submit";
  requiresTapApproval: true;
  dispatch: "dry-run";
  dryRun: true;
  wouldSubmit: true;
  unsafeSideEffects: false;
  acceptedScopes: readonly string[];
  audit: {
    guard: "keyboard-submit-dry-run-and-scope";
    event: "basicTool.computeruse.keyboardSubmitInput.planned";
    metadata: Readonly<Record<string, unknown>>;
  };
};

export type KeyboardSubmitInputResult =
  | {
      ok: true;
      plan: KeyboardSubmitInputPlan;
      events: readonly string[];
    }
  | {
      ok: false;
      error: KeyboardSubmitInputError;
      events: readonly string[];
    };

export const keyboardSubmitInputDescriptor = {
  tool: "computeruse.keyboardSubmitInput",
  capability: "keyboard-submit-input",
  layer: "agent_executionEngine.basic_toolLayer.baseTools.computeruseBase.keyboardEmulation",
  defaultDispatch: "dry-run",
  requiresTapApproval: true,
  unsafeSideEffects: false,
} as const;

function cleanList(values: readonly string[] | undefined): string[] {
  return [...new Set((values ?? []).map((value) => value.trim()).filter(Boolean))];
}

function failure(
  code: KeyboardSubmitInputErrorCode,
  message: string,
  boundary: KeyboardSubmitInputBoundary,
): KeyboardSubmitInputResult {
  return {
    ok: false,
    error: {
      code,
      message,
      boundary,
      safeForRuntimeInspection: true,
      internalDetailExposed: false,
    },
    events: ["basicTool.computeruse.keyboardSubmitInput.rejected"],
  };
}

function resolveScopes(
  requestedScopes: readonly string[] | undefined,
  allowedScopes: readonly string[] | undefined,
): string[] | KeyboardSubmitInputResult {
  const requested = cleanList(requestedScopes);
  const allowed = cleanList(allowedScopes);

  if (requested.length === 0) {
    return [];
  }

  const denied = requested.filter((scope) => !allowed.includes(scope));
  if (denied.length > 0) {
    return failure(
      "SCOPE_DENIED",
      `keyboard submit input scope ${denied[0]} is outside runtime governance`,
      "scope",
    );
  }

  return requested;
}

export function planKeyboardSubmitInput(request: KeyboardSubmitInputRequest = {}): KeyboardSubmitInputResult {
  const repeat = request.repeat ?? 1;
  if (!Number.isInteger(repeat) || repeat < 1 || repeat > 5) {
    return failure("INVALID_REPEAT", "keyboard submit input repeat must be an integer from 1 to 5", "resource");
  }

  if (request.dryRun === false) {
    return failure(
      "REAL_SIDE_EFFECT_NOT_ALLOWED",
      "first-round keyboard submit input only returns a dry-run plan",
      "governance",
    );
  }

  if (request.contract?.accepted === false) {
    return failure(
      "CONTRACT_REJECTED",
      request.contract.reason ?? "keyboard submit input was rejected by runtime contract surface",
      "contract",
    );
  }

  if (request.governance?.accepted === false) {
    return failure(
      "GOVERNANCE_REJECTED",
      request.governance.reason ?? "keyboard submit input was rejected by runtime governance",
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
      tool: "computeruse.keyboardSubmitInput",
      capability: "keyboard-submit-input",
      runtimeId: request.runtimeId?.trim() || undefined,
      sessionId: request.sessionId?.trim() || undefined,
      invocationId: request.invocationId?.trim() || undefined,
      submitKey: request.submitKey ?? "Enter",
      targetHint: request.targetHint?.trim() || undefined,
      repeat,
      requiredPermission: "desktop:keyboard-submit",
      requiresTapApproval: true,
      dispatch: "dry-run",
      dryRun: true,
      wouldSubmit: true,
      unsafeSideEffects: false,
      acceptedScopes,
      audit: {
        guard: "keyboard-submit-dry-run-and-scope",
        event: "basicTool.computeruse.keyboardSubmitInput.planned",
        metadata: request.metadata ?? {},
      },
    },
    events: ["basicTool.computeruse.keyboardSubmitInput.planned"],
  };
}
