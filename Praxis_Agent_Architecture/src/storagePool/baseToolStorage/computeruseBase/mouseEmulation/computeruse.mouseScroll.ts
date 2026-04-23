/*
 * 文件定位：Agent 执行引擎 / 基础工具原语层 / 基础工具集合 / 计算机使用基础工具 / 鼠标模拟。
 * 核心目的：提供 计算机使用基础工具 / 鼠标模拟 中的“滚动鼠标”基础能力原语。
 * 能力要求1：需要定义该能力的输入、输出、错误、权限需求和可观测事件。
 * 能力要求2：这些基础工具是 Agent 成立的底层能力，不是 TAP 的最终高级工具库。
 * 能力要求3：后续 TAP 可以基于这些原语构建更强的工具编排、审批、替换和专业能力库。
 * 边界：保留 Agent 基础工具原语，不替代 TAP 的高级工具系统。
 * 对接：需要被 runtime.execEngine 拉起，并和 mainLoop、stateEngine、事件暴露、工具调用策略接通。
 * 实现提示：先补稳定类型契约、最小可测行为和清晰错误边界，再接入真实执行逻辑。
 */

export type MouseScrollBoundary = "input" | "governance" | "scope" | "resource";

export type MouseScrollGate = {
  accepted: boolean;
  reason?: string;
};

export type MouseScrollDirection = "up" | "down" | "left" | "right";

export type MouseScrollUnit = "line" | "page" | "pixel";

export type MouseScrollContext = {
  runtimeId?: string;
  invocationId?: string;
  dryRun?: boolean;
  guard?: MouseScrollGate;
  requestedScopes?: readonly string[];
  allowedScopes?: readonly string[];
  auditMetadata?: Readonly<Record<string, unknown>>;
};

export type MouseScrollRequest = {
  context?: MouseScrollContext;
  direction?: MouseScrollDirection;
  amount?: number;
  deltaX?: number;
  deltaY?: number;
  unit?: MouseScrollUnit;
  targetHint?: string;
  metadata?: Readonly<Record<string, unknown>>;
};

export type MouseScrollErrorCode =
  | "MISSING_RUNTIME_ID"
  | "MISSING_SCROLL_VECTOR"
  | "INVALID_SCROLL_VECTOR"
  | "INVALID_SCROLL_UNIT"
  | "INVALID_TARGET_HINT"
  | "GOVERNANCE_REJECTED"
  | "SCOPE_DENIED"
  | "REAL_SIDE_EFFECT_NOT_ALLOWED";

export type MouseScrollError = {
  code: MouseScrollErrorCode;
  message: string;
  boundary: MouseScrollBoundary;
  safeForRuntimeInspection: true;
  internalDetailExposed: false;
};

export type MouseScrollPlan = {
  toolId: "computeruse.mouseScroll";
  capability: "scroll-mouse";
  runtimeId: string;
  invocationId: string;
  vector: {
    deltaX: number;
    deltaY: number;
    unit: MouseScrollUnit;
  };
  targetHint?: string;
  requiredPermissions: readonly ["mouse:write", "ui:focus"];
  requiresTapApproval: true;
  dispatch: "dry-run";
  dryRun: true;
  wouldEmitWheelEvents: true;
  unsafeSideEffects: false;
  acceptedScopes: readonly string[];
  audit: {
    guard: "mouse-scroll-approval";
    event: "basicTool.computeruse.mouseScroll.planned";
    metadata: Readonly<Record<string, unknown>>;
  };
};

export type MouseScrollResult =
  | {
      ok: true;
      plan: MouseScrollPlan;
      events: readonly string[];
    }
  | {
      ok: false;
      error: MouseScrollError;
      events: readonly string[];
    };

export const mouseScrollDescriptor = {
  toolId: "computeruse.mouseScroll",
  capability: "scroll-mouse",
  layer: "agent_executionEngine.basic_toolLayer.baseTools.computeruseBase.mouseEmulation",
  defaultDispatch: "dry-run",
  requiresTapApproval: true,
  unsafeSideEffects: false,
} as const;

const MAX_SCROLL_DELTA = 100_000;
const SUPPORTED_UNITS: readonly MouseScrollUnit[] = ["line", "page", "pixel"];

function isBlank(value: string | undefined): boolean {
  return typeof value !== "string" || value.trim().length === 0;
}

function cleanList(values: readonly string[] | undefined): string[] {
  return [...new Set((values ?? []).map((value) => value.trim()).filter(Boolean))];
}

function failure(code: MouseScrollErrorCode, message: string, boundary: MouseScrollBoundary): MouseScrollResult {
  return {
    ok: false,
    error: {
      code,
      message,
      boundary,
      safeForRuntimeInspection: true,
      internalDetailExposed: false,
    },
    events: ["basicTool.computeruse.mouseScroll.rejected"],
  };
}

function isValidDelta(value: number): boolean {
  return Number.isFinite(value) && Number.isInteger(value) && Math.abs(value) <= MAX_SCROLL_DELTA;
}

function normalizeVector(
  request: Pick<MouseScrollRequest, "amount" | "deltaX" | "deltaY" | "direction" | "unit">,
): MouseScrollPlan["vector"] | MouseScrollResult {
  const unit = request.unit ?? "line";
  if (!SUPPORTED_UNITS.includes(unit)) {
    return failure("INVALID_SCROLL_UNIT", "mouseScroll unit must be line, page, or pixel", "input");
  }

  if (request.deltaX !== undefined || request.deltaY !== undefined) {
    const deltaX = request.deltaX ?? 0;
    const deltaY = request.deltaY ?? 0;
    if (!isValidDelta(deltaX) || !isValidDelta(deltaY) || (deltaX === 0 && deltaY === 0)) {
      return failure("INVALID_SCROLL_VECTOR", "mouseScroll deltaX/deltaY must be bounded non-zero integers", "input");
    }

    return { deltaX, deltaY, unit };
  }

  if (request.direction === undefined || request.amount === undefined) {
    return failure("MISSING_SCROLL_VECTOR", "mouseScroll requires either deltaX/deltaY or direction plus amount", "input");
  }

  if (!isValidDelta(request.amount) || request.amount <= 0) {
    return failure("INVALID_SCROLL_VECTOR", "mouseScroll amount must be a positive bounded integer", "resource");
  }

  if (request.direction === "up") {
    return { deltaX: 0, deltaY: -request.amount, unit };
  }

  if (request.direction === "down") {
    return { deltaX: 0, deltaY: request.amount, unit };
  }

  if (request.direction === "left") {
    return { deltaX: -request.amount, deltaY: 0, unit };
  }

  if (request.direction === "right") {
    return { deltaX: request.amount, deltaY: 0, unit };
  }

  return failure("INVALID_SCROLL_VECTOR", "mouseScroll direction is not supported", "input");
}

function resolveScopes(
  requestedScopes: readonly string[] | undefined,
  allowedScopes: readonly string[] | undefined,
): string[] | MouseScrollResult {
  const requested = cleanList(requestedScopes);
  const allowed = cleanList(allowedScopes);

  if (requested.length === 0) {
    return [];
  }

  const denied = requested.filter((scope) => !allowed.includes(scope));
  if (denied.length > 0) {
    return failure("SCOPE_DENIED", `mouseScroll scope ${denied[0]} is outside runtime governance`, "scope");
  }

  return requested;
}

export function planMouseScroll(request: MouseScrollRequest = {}): MouseScrollResult {
  const runtimeId = request.context?.runtimeId?.trim();
  if (isBlank(runtimeId)) {
    return failure("MISSING_RUNTIME_ID", "mouseScroll requires context.runtimeId for audit", "input");
  }

  if (request.context?.dryRun === false) {
    return failure("REAL_SIDE_EFFECT_NOT_ALLOWED", "first-round mouseScroll only supports dry-run planning", "governance");
  }

  if (request.context?.guard?.accepted === false) {
    return failure(
      "GOVERNANCE_REJECTED",
      request.context.guard.reason ?? "mouseScroll was rejected by runtime governance",
      "governance",
    );
  }

  const targetHint = request.targetHint?.trim() || undefined;
  if (targetHint?.includes("\0") === true) {
    return failure("INVALID_TARGET_HINT", "mouseScroll targetHint must be a safe string", "input");
  }

  const vector = normalizeVector(request);
  if ("ok" in vector) {
    return vector;
  }

  const acceptedScopes = resolveScopes(request.context?.requestedScopes, request.context?.allowedScopes);
  if (!Array.isArray(acceptedScopes)) {
    return acceptedScopes;
  }

  return {
    ok: true,
    plan: {
      toolId: "computeruse.mouseScroll",
      capability: "scroll-mouse",
      runtimeId: runtimeId ?? "",
      invocationId: request.context?.invocationId?.trim() || "mouseScroll:dry-run",
      vector,
      targetHint,
      requiredPermissions: ["mouse:write", "ui:focus"],
      requiresTapApproval: true,
      dispatch: "dry-run",
      dryRun: true,
      wouldEmitWheelEvents: true,
      unsafeSideEffects: false,
      acceptedScopes,
      audit: {
        guard: "mouse-scroll-approval",
        event: "basicTool.computeruse.mouseScroll.planned",
        metadata: {
          ...(request.context?.auditMetadata ?? {}),
          ...(request.metadata ?? {}),
        },
      },
    },
    events: ["basicTool.computeruse.mouseScroll.planned"],
  };
}
