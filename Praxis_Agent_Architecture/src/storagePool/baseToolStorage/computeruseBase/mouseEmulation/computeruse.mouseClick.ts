/*
 * 文件定位：Agent 执行引擎 / 基础工具原语层 / 基础工具集合 / 计算机使用基础工具 / 鼠标模拟。
 * 核心目的：提供 计算机使用基础工具 / 鼠标模拟 中的“执行鼠标点击”基础能力原语。
 * 能力要求1：需要定义该能力的输入、输出、错误、权限需求和可观测事件。
 * 能力要求2：这些基础工具是 Agent 成立的底层能力，不是 TAP 的最终高级工具库。
 * 能力要求3：后续 TAP 可以基于这些原语构建更强的工具编排、审批、替换和专业能力库。
 * 边界：保留 Agent 基础工具原语，不替代 TAP 的高级工具系统。
 * 对接：需要被 runtime.execEngine 拉起，并和 mainLoop、stateEngine、事件暴露、工具调用策略接通。
 * 实现提示：先补稳定类型契约、最小可测行为和清晰错误边界，再接入真实执行逻辑。
 */

export type MouseClickBoundary = "input" | "contract" | "governance" | "scope";

export type MouseClickGate = {
  accepted: boolean;
  reason?: string;
};

export type MouseClickButton = "left" | "right" | "middle" | "back" | "forward";

export type MouseClickPoint = {
  x: number;
  y: number;
};

export type MouseClickCoordinateSpace = "screen" | "window" | "normalized";

export type MouseClickRequest = {
  toolCallId?: string;
  button?: MouseClickButton;
  clickCount?: number;
  at?: MouseClickPoint;
  coordinateSpace?: MouseClickCoordinateSpace;
  displayId?: string;
  requestedScopes?: readonly string[];
  allowedScopes?: readonly string[];
  dryRun?: boolean;
  contract?: MouseClickGate;
  governance?: MouseClickGate;
  metadata?: Readonly<Record<string, unknown>>;
};

export type MouseClickErrorCode =
  | "INVALID_BUTTON"
  | "INVALID_CLICK_COUNT"
  | "INVALID_COORDINATE_SPACE"
  | "INVALID_TARGET"
  | "CONTRACT_REJECTED"
  | "GOVERNANCE_REJECTED"
  | "SCOPE_DENIED"
  | "REAL_SIDE_EFFECT_NOT_ALLOWED";

export type MouseClickError = {
  code: MouseClickErrorCode;
  message: string;
  boundary: MouseClickBoundary;
  safeForRuntimeInspection: true;
  internalDetailExposed: false;
};

export type MouseClickPlan = {
  kind: "agentCore.basicTool.computeruse.mouseClick.plan";
  operation: "click-mouse";
  button: MouseClickButton;
  clickCount: number;
  at?: MouseClickPoint;
  coordinateSpace: MouseClickCoordinateSpace;
  displayId?: string;
  usesCurrentCursor: boolean;
  requiredPermission: "computeruse:mouse:click";
  requiresTapApproval: true;
  dispatch: "dry-run";
  dryRun: true;
  wouldClick: true;
  unsafeSideEffects: false;
  acceptedScopes: readonly string[];
  audit: {
    toolCallId: string;
    event: "basicTool.computeruse.mouseClick.planned";
    metadata: Readonly<Record<string, unknown>>;
  };
};

export type MouseClickResult =
  | {
      ok: true;
      plan: MouseClickPlan;
      events: readonly string[];
    }
  | {
      ok: false;
      error: MouseClickError;
      events: readonly string[];
    };

export const mouseClickDescriptor = {
  tool: "computeruse.mouseClick",
  capability: "click-mouse",
  layer: "agent_executionEngine.basic_toolLayer.baseTools.computeruseBase.mouseEmulation",
  defaultDispatch: "dry-run",
  requiresTapApproval: true,
  unsafeSideEffects: false,
} as const;

const allowedButtons: readonly MouseClickButton[] = ["left", "right", "middle", "back", "forward"];
const allowedCoordinateSpaces: readonly MouseClickCoordinateSpace[] = ["screen", "window", "normalized"];

function cleanList(values: readonly string[] | undefined): readonly string[] {
  return [...new Set((values ?? []).map((value) => value.trim()).filter(Boolean))];
}

function failure(code: MouseClickErrorCode, message: string, boundary: MouseClickBoundary): MouseClickResult {
  return {
    ok: false,
    error: {
      code,
      message,
      boundary,
      safeForRuntimeInspection: true,
      internalDetailExposed: false,
    },
    events: ["basicTool.computeruse.mouseClick.rejected"],
  };
}

function resolveAcceptedScopes(
  requestedScopes: readonly string[] | undefined,
  allowedScopes: readonly string[] | undefined,
): readonly string[] | MouseClickResult {
  const requested = cleanList(requestedScopes);
  const allowed = cleanList(allowedScopes);

  if (requested.length === 0) {
    return [];
  }

  const denied = requested.filter((scope) => !allowed.includes(scope));
  if (denied.length > 0) {
    return failure("SCOPE_DENIED", `computeruse.mouseClick scope ${denied[0]} is outside runtime governance`, "scope");
  }

  return requested;
}

function isValidPoint(point: MouseClickPoint | undefined): boolean {
  return (
    point === undefined ||
    (Number.isFinite(point.x) && Number.isFinite(point.y) && point.x >= 0 && point.y >= 0)
  );
}

function normalizeButton(button: MouseClickButton | undefined): MouseClickButton | MouseClickResult {
  const resolved = button ?? "left";
  if (!allowedButtons.includes(resolved)) {
    return failure("INVALID_BUTTON", "computeruse.mouseClick button is not supported by this base primitive", "input");
  }

  return resolved;
}

function normalizeClickCount(clickCount: number | undefined): number | MouseClickResult {
  const resolved = clickCount ?? 1;
  if (!Number.isInteger(resolved) || resolved < 1 || resolved > 3) {
    return failure("INVALID_CLICK_COUNT", "computeruse.mouseClick clickCount must be an integer from 1 to 3", "input");
  }

  return resolved;
}

function normalizeCoordinateSpace(
  coordinateSpace: MouseClickCoordinateSpace | undefined,
): MouseClickCoordinateSpace | MouseClickResult {
  const resolved = coordinateSpace ?? "screen";
  if (!allowedCoordinateSpaces.includes(resolved)) {
    return failure(
      "INVALID_COORDINATE_SPACE",
      "computeruse.mouseClick coordinateSpace must be screen, window, or normalized",
      "input",
    );
  }

  return resolved;
}

export function planMouseClick(request: MouseClickRequest = {}): MouseClickResult {
  const button = normalizeButton(request.button);
  if (typeof button !== "string") {
    return button;
  }

  const clickCount = normalizeClickCount(request.clickCount);
  if (typeof clickCount !== "number") {
    return clickCount;
  }

  if (!isValidPoint(request.at)) {
    return failure("INVALID_TARGET", "computeruse.mouseClick target must use finite non-negative coordinates", "input");
  }

  const coordinateSpace = normalizeCoordinateSpace(request.coordinateSpace);
  if (typeof coordinateSpace !== "string") {
    return coordinateSpace;
  }

  if (request.dryRun === false) {
    return failure(
      "REAL_SIDE_EFFECT_NOT_ALLOWED",
      "first-round computeruse.mouseClick only supports dry-run planning",
      "governance",
    );
  }

  if (request.contract?.accepted === false) {
    return failure(
      "CONTRACT_REJECTED",
      request.contract.reason ?? "computeruse.mouseClick was rejected by runtime contract surface",
      "contract",
    );
  }

  if (request.governance?.accepted === false) {
    return failure(
      "GOVERNANCE_REJECTED",
      request.governance.reason ?? "computeruse.mouseClick was rejected by runtime governance",
      "governance",
    );
  }

  const acceptedScopes = resolveAcceptedScopes(request.requestedScopes, request.allowedScopes);
  if ("ok" in acceptedScopes) {
    return acceptedScopes;
  }

  return {
    ok: true,
    plan: {
      kind: "agentCore.basicTool.computeruse.mouseClick.plan",
      operation: "click-mouse",
      button,
      clickCount,
      at: request.at,
      coordinateSpace,
      displayId: request.displayId?.trim() || undefined,
      usesCurrentCursor: request.at === undefined,
      requiredPermission: "computeruse:mouse:click",
      requiresTapApproval: true,
      dispatch: "dry-run",
      dryRun: true,
      wouldClick: true,
      unsafeSideEffects: false,
      acceptedScopes,
      audit: {
        toolCallId: request.toolCallId?.trim() || "computeruse.mouseClick:dry-run",
        event: "basicTool.computeruse.mouseClick.planned",
        metadata: request.metadata ?? {},
      },
    },
    events: ["basicTool.computeruse.mouseClick.planned"],
  };
}
