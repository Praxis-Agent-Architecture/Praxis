/*
 * 文件定位：Agent 执行引擎 / 基础工具原语层 / 基础工具集合 / 计算机使用基础工具 / 键盘模拟。
 * 核心目的：提供 计算机使用基础工具 / 键盘模拟 中的“确认输入选择框”基础能力原语。
 * 能力要求1：需要定义该能力的输入、输出、错误、权限需求和可观测事件。
 * 能力要求2：这些基础工具是 Agent 成立的底层能力，不是 TAP 的最终高级工具库。
 * 能力要求3：后续 TAP 可以基于这些原语构建更强的工具编排、审批、替换和专业能力库。
 * 边界：保留 Agent 基础工具原语，不替代 TAP 的高级工具系统。
 * 对接：需要被 runtime.execEngine 拉起，并和 mainLoop、stateEngine、事件暴露、工具调用策略接通。
 * 实现提示：先补稳定类型契约、最小可测行为和清晰错误边界，再接入真实执行逻辑。
 */

export type InputCheckboxConfirmBoundary = "input" | "governance" | "scope";

export type InputCheckboxConfirmGate = {
  accepted: boolean;
  reason?: string;
};

export type InputCheckboxConfirmState = "checked" | "unchecked";

export type InputCheckboxConfirmContext = {
  runtimeId?: string;
  invocationId?: string;
  dryRun?: boolean;
  guard?: InputCheckboxConfirmGate;
  requestedScopes?: readonly string[];
  allowedScopes?: readonly string[];
  auditMetadata?: Readonly<Record<string, unknown>>;
};

export type InputCheckboxConfirmTarget = {
  label?: string;
  selectorHint?: string;
  expectedState?: InputCheckboxConfirmState;
  currentState?: InputCheckboxConfirmState;
};

export type InputCheckboxConfirmRequest = {
  context?: InputCheckboxConfirmContext;
  target?: InputCheckboxConfirmTarget;
  confirmationKey?: "space" | "enter";
  metadata?: Readonly<Record<string, unknown>>;
};

export type InputCheckboxConfirmErrorCode =
  | "MISSING_RUNTIME_ID"
  | "MISSING_TARGET"
  | "INVALID_TARGET"
  | "GOVERNANCE_REJECTED"
  | "SCOPE_DENIED"
  | "REAL_SIDE_EFFECT_NOT_ALLOWED";

export type InputCheckboxConfirmError = {
  code: InputCheckboxConfirmErrorCode;
  message: string;
  boundary: InputCheckboxConfirmBoundary;
  safeForRuntimeInspection: true;
  internalDetailExposed: false;
};

export type InputCheckboxConfirmPlan = {
  toolId: "computeruse.inputCheckboxConfirm";
  capability: "confirm-input-checkbox";
  runtimeId: string;
  invocationId: string;
  target: Required<Pick<InputCheckboxConfirmTarget, "expectedState">> &
    Pick<InputCheckboxConfirmTarget, "label" | "selectorHint" | "currentState">;
  confirmationKey: "space" | "enter";
  keySequence: readonly string[];
  requiredPermissions: readonly ["keyboard:write", "ui:focus"];
  requiresTapApproval: true;
  dispatch: "dry-run";
  dryRun: true;
  wouldConfirmCheckbox: true;
  wouldToggle: boolean;
  unsafeSideEffects: false;
  acceptedScopes: readonly string[];
  audit: {
    guard: "focused-checkbox-confirm-approval";
    event: "basicTool.computeruse.inputCheckboxConfirm.planned";
    metadata: Readonly<Record<string, unknown>>;
  };
};

export type InputCheckboxConfirmResult =
  | {
      ok: true;
      plan: InputCheckboxConfirmPlan;
      events: readonly string[];
    }
  | {
      ok: false;
      error: InputCheckboxConfirmError;
      events: readonly string[];
    };

export const inputCheckboxConfirmDescriptor = {
  toolId: "computeruse.inputCheckboxConfirm",
  capability: "confirm-input-checkbox",
  layer: "agent_executionEngine.basic_toolLayer.baseTools.computeruseBase.keyboardEmulation",
  defaultDispatch: "dry-run",
  requiresTapApproval: true,
  unsafeSideEffects: false,
} as const;

function isBlank(value: string | undefined): boolean {
  return typeof value !== "string" || value.trim().length === 0;
}

function cleanList(values: readonly string[] | undefined): string[] {
  return [...new Set((values ?? []).map((value) => value.trim()).filter(Boolean))];
}

function failure(
  code: InputCheckboxConfirmErrorCode,
  message: string,
  boundary: InputCheckboxConfirmBoundary,
): InputCheckboxConfirmResult {
  return {
    ok: false,
    error: {
      code,
      message,
      boundary,
      safeForRuntimeInspection: true,
      internalDetailExposed: false,
    },
    events: ["basicTool.computeruse.inputCheckboxConfirm.rejected"],
  };
}

function normalizeTarget(
  target: InputCheckboxConfirmTarget | undefined,
): InputCheckboxConfirmPlan["target"] | InputCheckboxConfirmResult {
  if (target === undefined) {
    return failure("MISSING_TARGET", "inputCheckboxConfirm requires a checkbox target", "input");
  }

  const label = target.label?.trim() || undefined;
  const selectorHint = target.selectorHint?.trim() || undefined;
  if (label === undefined && selectorHint === undefined) {
    return failure("INVALID_TARGET", "inputCheckboxConfirm target requires label or selectorHint", "input");
  }

  if (label?.includes("\0") === true || selectorHint?.includes("\0") === true) {
    return failure("INVALID_TARGET", "inputCheckboxConfirm target hints must be safe strings", "input");
  }

  return {
    label,
    selectorHint,
    expectedState: target.expectedState ?? "checked",
    currentState: target.currentState,
  };
}

function resolveScopes(
  requestedScopes: readonly string[] | undefined,
  allowedScopes: readonly string[] | undefined,
): string[] | InputCheckboxConfirmResult {
  const requested = cleanList(requestedScopes);
  const allowed = cleanList(allowedScopes);

  if (requested.length === 0) {
    return [];
  }

  const denied = requested.filter((scope) => !allowed.includes(scope));
  if (denied.length > 0) {
    return failure("SCOPE_DENIED", `inputCheckboxConfirm scope ${denied[0]} is outside runtime governance`, "scope");
  }

  return requested;
}

export function planInputCheckboxConfirm(request: InputCheckboxConfirmRequest = {}): InputCheckboxConfirmResult {
  const runtimeId = request.context?.runtimeId?.trim();
  if (isBlank(runtimeId)) {
    return failure("MISSING_RUNTIME_ID", "inputCheckboxConfirm requires context.runtimeId for audit", "input");
  }

  if (request.context?.dryRun === false) {
    return failure(
      "REAL_SIDE_EFFECT_NOT_ALLOWED",
      "first-round inputCheckboxConfirm only supports dry-run planning",
      "governance",
    );
  }

  if (request.context?.guard?.accepted === false) {
    return failure(
      "GOVERNANCE_REJECTED",
      request.context.guard.reason ?? "inputCheckboxConfirm was rejected by runtime governance",
      "governance",
    );
  }

  const target = normalizeTarget(request.target);
  if ("ok" in target) {
    return target;
  }

  const acceptedScopes = resolveScopes(request.context?.requestedScopes, request.context?.allowedScopes);
  if (!Array.isArray(acceptedScopes)) {
    return acceptedScopes;
  }

  const confirmationKey = request.confirmationKey ?? "space";
  const wouldToggle = target.currentState === undefined || target.currentState !== target.expectedState;

  return {
    ok: true,
    plan: {
      toolId: "computeruse.inputCheckboxConfirm",
      capability: "confirm-input-checkbox",
      runtimeId: runtimeId ?? "",
      invocationId: request.context?.invocationId?.trim() || "inputCheckboxConfirm:dry-run",
      target,
      confirmationKey,
      keySequence: [confirmationKey === "space" ? "Space" : "Enter"],
      requiredPermissions: ["keyboard:write", "ui:focus"],
      requiresTapApproval: true,
      dispatch: "dry-run",
      dryRun: true,
      wouldConfirmCheckbox: true,
      wouldToggle,
      unsafeSideEffects: false,
      acceptedScopes,
      audit: {
        guard: "focused-checkbox-confirm-approval",
        event: "basicTool.computeruse.inputCheckboxConfirm.planned",
        metadata: {
          ...(request.context?.auditMetadata ?? {}),
          ...(request.metadata ?? {}),
        },
      },
    },
    events: ["basicTool.computeruse.inputCheckboxConfirm.planned"],
  };
}
