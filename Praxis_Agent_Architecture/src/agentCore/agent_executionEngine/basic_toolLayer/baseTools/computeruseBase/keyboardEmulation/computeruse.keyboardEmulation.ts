/*
 * 文件定位：Agent 执行引擎 / 基础工具原语层 / 基础工具集合 / 计算机使用基础工具 / 键盘模拟。
 * 核心目的：提供 计算机使用基础工具 / 键盘模拟 中的“模拟键盘”基础能力原语。
 * 能力要求1：需要定义该能力的输入、输出、错误、权限需求和可观测事件。
 * 能力要求2：这些基础工具是 Agent 成立的底层能力，不是 TAP 的最终高级工具库。
 * 能力要求3：后续 TAP 可以基于这些原语构建更强的工具编排、审批、替换和专业能力库。
 * 边界：保留 Agent 基础工具原语，不替代 TAP 的高级工具系统。
 * 对接：需要被 runtime.execEngine 拉起，并和 mainLoop、stateEngine、事件暴露、工具调用策略接通。
 * 实现提示：先补稳定类型契约、最小可测行为和清晰错误边界，再接入真实执行逻辑。
 */

export type KeyboardEmulationBoundary = "input" | "governance" | "scope" | "resource";

export type KeyboardEmulationGate = {
  accepted: boolean;
  reason?: string;
};

export type KeyboardEmulationAction =
  | {
      kind: "key-press";
      key: string;
      repeat?: number;
    }
  | {
      kind: "text";
      text: string;
    }
  | {
      kind: "shortcut";
      keys: readonly string[];
    };

export type KeyboardEmulationContext = {
  runtimeId?: string;
  invocationId?: string;
  dryRun?: boolean;
  guard?: KeyboardEmulationGate;
  requestedScopes?: readonly string[];
  allowedScopes?: readonly string[];
  auditMetadata?: Readonly<Record<string, unknown>>;
};

export type KeyboardEmulationRequest = {
  context?: KeyboardEmulationContext;
  actions?: readonly KeyboardEmulationAction[];
  targetHint?: string;
  metadata?: Readonly<Record<string, unknown>>;
};

export type KeyboardEmulationErrorCode =
  | "MISSING_RUNTIME_ID"
  | "MISSING_ACTIONS"
  | "INVALID_ACTION"
  | "TOO_MANY_ACTIONS"
  | "INVALID_TARGET_HINT"
  | "GOVERNANCE_REJECTED"
  | "SCOPE_DENIED"
  | "REAL_SIDE_EFFECT_NOT_ALLOWED";

export type KeyboardEmulationError = {
  code: KeyboardEmulationErrorCode;
  message: string;
  boundary: KeyboardEmulationBoundary;
  safeForRuntimeInspection: true;
  internalDetailExposed: false;
};

export type KeyboardEmulationPlan = {
  toolId: "computeruse.keyboardEmulation";
  capability: "simulate-keyboard";
  runtimeId: string;
  invocationId: string;
  actions: readonly KeyboardEmulationAction[];
  targetHint?: string;
  requiredPermissions: readonly ["keyboard:write", "ui:focus"];
  requiresTapApproval: true;
  dispatch: "dry-run";
  dryRun: true;
  wouldEmitKeyboardEvents: true;
  unsafeSideEffects: false;
  acceptedScopes: readonly string[];
  audit: {
    guard: "focused-keyboard-emulation-approval";
    event: "basicTool.computeruse.keyboardEmulation.planned";
    metadata: Readonly<Record<string, unknown>>;
  };
};

export type KeyboardEmulationResult =
  | {
      ok: true;
      plan: KeyboardEmulationPlan;
      events: readonly string[];
    }
  | {
      ok: false;
      error: KeyboardEmulationError;
      events: readonly string[];
    };

export const keyboardEmulationDescriptor = {
  toolId: "computeruse.keyboardEmulation",
  capability: "simulate-keyboard",
  layer: "agent_executionEngine.basic_toolLayer.baseTools.computeruseBase.keyboardEmulation",
  defaultDispatch: "dry-run",
  requiresTapApproval: true,
  unsafeSideEffects: false,
} as const;

const MAX_KEYBOARD_ACTIONS = 64;
const MAX_TEXT_LENGTH = 4096;

function isBlank(value: string | undefined): boolean {
  return typeof value !== "string" || value.trim().length === 0;
}

function cleanList(values: readonly string[] | undefined): string[] {
  return [...new Set((values ?? []).map((value) => value.trim()).filter(Boolean))];
}

function failure(
  code: KeyboardEmulationErrorCode,
  message: string,
  boundary: KeyboardEmulationBoundary,
): KeyboardEmulationResult {
  return {
    ok: false,
    error: {
      code,
      message,
      boundary,
      safeForRuntimeInspection: true,
      internalDetailExposed: false,
    },
    events: ["basicTool.computeruse.keyboardEmulation.rejected"],
  };
}

function normalizeAction(action: KeyboardEmulationAction): KeyboardEmulationAction | KeyboardEmulationResult {
  if (action.kind === "key-press") {
    const key = action.key.trim();
    const repeat = action.repeat ?? 1;
    if (key.length === 0 || key.includes("\0") || !Number.isInteger(repeat) || repeat <= 0 || repeat > 100) {
      return failure("INVALID_ACTION", "keyboardEmulation key-press requires a safe key and repeat 1..100", "input");
    }

    return { kind: "key-press", key, repeat };
  }

  if (action.kind === "text") {
    if (action.text.length === 0 || action.text.length > MAX_TEXT_LENGTH || action.text.includes("\0")) {
      return failure("INVALID_ACTION", "keyboardEmulation text action must be non-empty and bounded", "input");
    }

    return { kind: "text", text: action.text };
  }

  if (action.kind === "shortcut") {
    const keys = cleanList(action.keys);
    if (keys.length < 2 || keys.length > 5 || keys.some((key) => key.includes("\0"))) {
      return failure("INVALID_ACTION", "keyboardEmulation shortcut requires 2..5 safe keys", "input");
    }

    return { kind: "shortcut", keys };
  }

  return failure("INVALID_ACTION", "keyboardEmulation action kind is not supported", "input");
}

function normalizeActions(
  actions: readonly KeyboardEmulationAction[] | undefined,
): readonly KeyboardEmulationAction[] | KeyboardEmulationResult {
  if (actions === undefined || actions.length === 0) {
    return failure("MISSING_ACTIONS", "keyboardEmulation requires at least one keyboard action", "input");
  }

  if (actions.length > MAX_KEYBOARD_ACTIONS) {
    return failure("TOO_MANY_ACTIONS", "keyboardEmulation action count is outside the resource limit", "resource");
  }

  const normalized: KeyboardEmulationAction[] = [];
  for (const action of actions) {
    const next = normalizeAction(action);
    if ("ok" in next) {
      return next;
    }

    normalized.push(next);
  }

  return Object.freeze(normalized);
}

function resolveScopes(
  requestedScopes: readonly string[] | undefined,
  allowedScopes: readonly string[] | undefined,
): string[] | KeyboardEmulationResult {
  const requested = cleanList(requestedScopes);
  const allowed = cleanList(allowedScopes);

  if (requested.length === 0) {
    return [];
  }

  const denied = requested.filter((scope) => !allowed.includes(scope));
  if (denied.length > 0) {
    return failure("SCOPE_DENIED", `keyboardEmulation scope ${denied[0]} is outside runtime governance`, "scope");
  }

  return requested;
}

export function planKeyboardEmulation(request: KeyboardEmulationRequest = {}): KeyboardEmulationResult {
  const runtimeId = request.context?.runtimeId?.trim();
  if (isBlank(runtimeId)) {
    return failure("MISSING_RUNTIME_ID", "keyboardEmulation requires context.runtimeId for audit", "input");
  }

  if (request.context?.dryRun === false) {
    return failure(
      "REAL_SIDE_EFFECT_NOT_ALLOWED",
      "first-round keyboardEmulation only supports dry-run planning",
      "governance",
    );
  }

  if (request.context?.guard?.accepted === false) {
    return failure(
      "GOVERNANCE_REJECTED",
      request.context.guard.reason ?? "keyboardEmulation was rejected by runtime governance",
      "governance",
    );
  }

  const targetHint = request.targetHint?.trim() || undefined;
  if (targetHint?.includes("\0") === true) {
    return failure("INVALID_TARGET_HINT", "keyboardEmulation targetHint must be a safe string", "input");
  }

  const actions = normalizeActions(request.actions);
  if ("ok" in actions) {
    return actions;
  }

  const acceptedScopes = resolveScopes(request.context?.requestedScopes, request.context?.allowedScopes);
  if (!Array.isArray(acceptedScopes)) {
    return acceptedScopes;
  }

  return {
    ok: true,
    plan: {
      toolId: "computeruse.keyboardEmulation",
      capability: "simulate-keyboard",
      runtimeId: runtimeId ?? "",
      invocationId: request.context?.invocationId?.trim() || "keyboardEmulation:dry-run",
      actions,
      targetHint,
      requiredPermissions: ["keyboard:write", "ui:focus"],
      requiresTapApproval: true,
      dispatch: "dry-run",
      dryRun: true,
      wouldEmitKeyboardEvents: true,
      unsafeSideEffects: false,
      acceptedScopes,
      audit: {
        guard: "focused-keyboard-emulation-approval",
        event: "basicTool.computeruse.keyboardEmulation.planned",
        metadata: {
          ...(request.context?.auditMetadata ?? {}),
          ...(request.metadata ?? {}),
        },
      },
    },
    events: ["basicTool.computeruse.keyboardEmulation.planned"],
  };
}
