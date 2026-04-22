/*
 * 文件定位：Agent 执行引擎 / 基础工具原语层 / 基础工具集合 / 计算机使用基础工具 / 鼠标模拟。
 * 核心目的：提供 计算机使用基础工具 / 鼠标模拟 中的“确认鼠标选择框”基础能力原语。
 * 能力要求1：需要定义该能力的输入、输出、错误、权限需求和可观测事件。
 * 能力要求2：这些基础工具是 Agent 成立的底层能力，不是 TAP 的最终高级工具库。
 * 能力要求3：后续 TAP 可以基于这些原语构建更强的工具编排、审批、替换和专业能力库。
 * 边界：保留 Agent 基础工具原语，不替代 TAP 的高级工具系统。
 * 对接：需要被 runtime.execEngine 拉起，并和 mainLoop、stateEngine、事件暴露、工具调用策略接通。
 * 实现提示：先补稳定类型契约、最小可测行为和清晰错误边界，再接入真实执行逻辑。
 */

export type CheckboxConfirmBoundary = "input" | "governance" | "scope";

export type CheckboxConfirmGate = {
  accepted: boolean;
  reason?: string;
};

export type CheckboxConfirmState = "checked" | "unchecked";

export type CheckboxConfirmContext = {
  runtimeId?: string;
  invocationId?: string;
  dryRun?: boolean;
  guard?: CheckboxConfirmGate;
  requestedScopes?: readonly string[];
  allowedScopes?: readonly string[];
  auditMetadata?: Readonly<Record<string, unknown>>;
};

export type CheckboxConfirmPoint = {
  x: number;
  y: number;
};

export type CheckboxConfirmTarget = {
  label?: string;
  selectorHint?: string;
  point?: CheckboxConfirmPoint;
  expectedState?: CheckboxConfirmState;
  currentState?: CheckboxConfirmState;
};

export type CheckboxConfirmRequest = {
  context?: CheckboxConfirmContext;
  target?: CheckboxConfirmTarget;
  clickMode?: "single-click" | "double-click";
  metadata?: Readonly<Record<string, unknown>>;
};

export type CheckboxConfirmErrorCode =
  | "MISSING_RUNTIME_ID"
  | "MISSING_TARGET"
  | "INVALID_TARGET"
  | "INVALID_POINT"
  | "INVALID_STATE"
  | "INVALID_CLICK_MODE"
  | "GOVERNANCE_REJECTED"
  | "SCOPE_DENIED"
  | "REAL_SIDE_EFFECT_NOT_ALLOWED";

export type CheckboxConfirmError = {
  code: CheckboxConfirmErrorCode;
  message: string;
  boundary: CheckboxConfirmBoundary;
  safeForRuntimeInspection: true;
  internalDetailExposed: false;
};

export type CheckboxConfirmPlan = {
  toolId: "computeruse.checkboxConfirm";
  capability: "confirm-mouse-checkbox";
  runtimeId: string;
  invocationId: string;
  target: Required<Pick<CheckboxConfirmTarget, "expectedState">> &
    Pick<CheckboxConfirmTarget, "label" | "selectorHint" | "point" | "currentState">;
  clickMode: "single-click" | "double-click";
  mouseAction: {
    type: "click";
    button: "left";
    clickCount: 1 | 2;
    point?: CheckboxConfirmPoint;
  };
  requiredPermissions: readonly ["mouse:write", "ui:focus"];
  requiresTapApproval: true;
  dispatch: "dry-run";
  dryRun: true;
  wouldConfirmCheckbox: true;
  wouldToggle: boolean;
  unsafeSideEffects: false;
  acceptedScopes: readonly string[];
  audit: {
    guard: "mouse-checkbox-confirm-approval";
    event: "basicTool.computeruse.checkboxConfirm.planned";
    metadata: Readonly<Record<string, unknown>>;
  };
};

export type CheckboxConfirmResult =
  | {
      ok: true;
      plan: CheckboxConfirmPlan;
      events: readonly string[];
    }
  | {
      ok: false;
      error: CheckboxConfirmError;
      events: readonly string[];
    };

export const checkboxConfirmDescriptor = {
  toolId: "computeruse.checkboxConfirm",
  capability: "confirm-mouse-checkbox",
  layer: "agent_executionEngine.basic_toolLayer.baseTools.computeruseBase.mouseEmulation",
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
  code: CheckboxConfirmErrorCode,
  message: string,
  boundary: CheckboxConfirmBoundary,
): CheckboxConfirmResult {
  return {
    ok: false,
    error: {
      code,
      message,
      boundary,
      safeForRuntimeInspection: true,
      internalDetailExposed: false,
    },
    events: ["basicTool.computeruse.checkboxConfirm.rejected"],
  };
}

function normalizePoint(point: CheckboxConfirmPoint | undefined): CheckboxConfirmPoint | CheckboxConfirmResult | undefined {
  if (point === undefined) {
    return undefined;
  }

  if (
    !Number.isFinite(point.x) ||
    !Number.isFinite(point.y) ||
    point.x < 0 ||
    point.y < 0 ||
    !Number.isInteger(point.x) ||
    !Number.isInteger(point.y)
  ) {
    return failure("INVALID_POINT", "checkboxConfirm point must use non-negative integer screen coordinates", "input");
  }

  return { x: point.x, y: point.y };
}

function normalizeState(
  state: CheckboxConfirmState | undefined,
  fallback?: CheckboxConfirmState,
): CheckboxConfirmState | CheckboxConfirmResult | undefined {
  const resolved = state ?? fallback;
  if (resolved === undefined || resolved === "checked" || resolved === "unchecked") {
    return resolved;
  }

  return failure("INVALID_STATE", "checkboxConfirm state must be checked or unchecked", "input");
}

function normalizeTarget(target: CheckboxConfirmTarget | undefined): CheckboxConfirmPlan["target"] | CheckboxConfirmResult {
  if (target === undefined) {
    return failure("MISSING_TARGET", "checkboxConfirm requires a checkbox target", "input");
  }

  const label = target.label?.trim() || undefined;
  const selectorHint = target.selectorHint?.trim() || undefined;
  const point = normalizePoint(target.point);
  if (point !== undefined && "ok" in point) {
    return point;
  }

  if (label === undefined && selectorHint === undefined && point === undefined) {
    return failure("INVALID_TARGET", "checkboxConfirm target requires label, selectorHint, or point", "input");
  }

  if (label?.includes("\0") === true || selectorHint?.includes("\0") === true) {
    return failure("INVALID_TARGET", "checkboxConfirm target hints must be safe strings", "input");
  }

  const expectedState = normalizeState(target.expectedState, "checked");
  if (expectedState === undefined || (typeof expectedState !== "string" && "ok" in expectedState)) {
    return expectedState ?? failure("INVALID_STATE", "checkboxConfirm expectedState is required", "input");
  }

  const currentState = normalizeState(target.currentState);
  if (currentState !== undefined && typeof currentState !== "string") {
    return currentState;
  }

  return {
    label,
    selectorHint,
    point,
    expectedState,
    currentState,
  };
}

function normalizeClickMode(
  clickMode: CheckboxConfirmRequest["clickMode"] | undefined,
): CheckboxConfirmPlan["clickMode"] | CheckboxConfirmResult {
  const resolved = clickMode ?? "single-click";
  if (resolved === "single-click" || resolved === "double-click") {
    return resolved;
  }

  return failure("INVALID_CLICK_MODE", "checkboxConfirm clickMode must be single-click or double-click", "input");
}

function resolveScopes(
  requestedScopes: readonly string[] | undefined,
  allowedScopes: readonly string[] | undefined,
): string[] | CheckboxConfirmResult {
  const requested = cleanList(requestedScopes);
  const allowed = cleanList(allowedScopes);

  if (requested.length === 0) {
    return [];
  }

  const denied = requested.filter((scope) => !allowed.includes(scope));
  if (denied.length > 0) {
    return failure("SCOPE_DENIED", `checkboxConfirm scope ${denied[0]} is outside runtime governance`, "scope");
  }

  return requested;
}

export function planCheckboxConfirm(request: CheckboxConfirmRequest = {}): CheckboxConfirmResult {
  const runtimeId = request.context?.runtimeId?.trim();
  if (isBlank(runtimeId)) {
    return failure("MISSING_RUNTIME_ID", "checkboxConfirm requires context.runtimeId for audit", "input");
  }

  if (request.context?.dryRun === false) {
    return failure(
      "REAL_SIDE_EFFECT_NOT_ALLOWED",
      "first-round checkboxConfirm only supports dry-run planning",
      "governance",
    );
  }

  if (request.context?.guard?.accepted === false) {
    return failure(
      "GOVERNANCE_REJECTED",
      request.context.guard.reason ?? "checkboxConfirm was rejected by runtime governance",
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

  const clickMode = normalizeClickMode(request.clickMode);
  if (typeof clickMode !== "string") {
    return clickMode;
  }

  const wouldToggle = target.currentState === undefined || target.currentState !== target.expectedState;

  return {
    ok: true,
    plan: {
      toolId: "computeruse.checkboxConfirm",
      capability: "confirm-mouse-checkbox",
      runtimeId: runtimeId ?? "",
      invocationId: request.context?.invocationId?.trim() || "checkboxConfirm:dry-run",
      target,
      clickMode,
      mouseAction: {
        type: "click",
        button: "left",
        clickCount: clickMode === "single-click" ? 1 : 2,
        point: target.point,
      },
      requiredPermissions: ["mouse:write", "ui:focus"],
      requiresTapApproval: true,
      dispatch: "dry-run",
      dryRun: true,
      wouldConfirmCheckbox: true,
      wouldToggle,
      unsafeSideEffects: false,
      acceptedScopes,
      audit: {
        guard: "mouse-checkbox-confirm-approval",
        event: "basicTool.computeruse.checkboxConfirm.planned",
        metadata: {
          ...(request.context?.auditMetadata ?? {}),
          ...(request.metadata ?? {}),
        },
      },
    },
    events: ["basicTool.computeruse.checkboxConfirm.planned"],
  };
}
