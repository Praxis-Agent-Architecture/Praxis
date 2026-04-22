/*
 * 文件定位：Agent 执行引擎 / 基础工具原语层 / 基础工具集合 / 计算机使用基础工具 / 鼠标模拟。
 * 核心目的：提供 计算机使用基础工具 / 鼠标模拟 中的“移动鼠标”基础能力原语。
 * 能力要求1：需要定义该能力的输入、输出、错误、权限需求和可观测事件。
 * 能力要求2：这些基础工具是 Agent 成立的底层能力，不是 TAP 的最终高级工具库。
 * 能力要求3：后续 TAP 可以基于这些原语构建更强的工具编排、审批、替换和专业能力库。
 * 边界：保留 Agent 基础工具原语，不替代 TAP 的高级工具系统。
 * 对接：需要被 runtime.execEngine 拉起，并和 mainLoop、stateEngine、事件暴露、工具调用策略接通。
 * 实现提示：先补稳定类型契约、最小可测行为和清晰错误边界，再接入真实执行逻辑。
 */

export type MouseMoveBoundary = "input" | "contract" | "governance" | "scope";

export type MouseMoveGate = {
  accepted: boolean;
  reason?: string;
};

export type MouseMoveCoordinateSpace = "screen" | "window" | "normalized";

export type MouseMovePoint = {
  x: number;
  y: number;
};

export type MouseMoveRequest = {
  toolCallId?: string;
  target?: MouseMovePoint;
  coordinateSpace?: MouseMoveCoordinateSpace;
  displayId?: string;
  durationMs?: number;
  requestedScopes?: readonly string[];
  allowedScopes?: readonly string[];
  dryRun?: boolean;
  contract?: MouseMoveGate;
  governance?: MouseMoveGate;
  metadata?: Readonly<Record<string, unknown>>;
};

export type MouseMoveErrorCode =
  | "MISSING_TARGET"
  | "INVALID_TARGET"
  | "INVALID_DURATION"
  | "INVALID_COORDINATE_SPACE"
  | "CONTRACT_REJECTED"
  | "GOVERNANCE_REJECTED"
  | "SCOPE_DENIED"
  | "REAL_SIDE_EFFECT_NOT_ALLOWED";

export type MouseMoveError = {
  code: MouseMoveErrorCode;
  message: string;
  boundary: MouseMoveBoundary;
  safeForRuntimeInspection: true;
  internalDetailExposed: false;
};

export type MouseMovePlan = {
  kind: "agentCore.basicTool.computeruse.mouseMove.plan";
  operation: "move-mouse";
  target: MouseMovePoint;
  coordinateSpace: MouseMoveCoordinateSpace;
  displayId?: string;
  durationMs: number;
  requiredPermission: "computeruse:mouse:move";
  requiresTapApproval: true;
  dispatch: "dry-run";
  dryRun: true;
  wouldMoveCursor: true;
  unsafeSideEffects: false;
  acceptedScopes: readonly string[];
  audit: {
    toolCallId: string;
    event: "basicTool.computeruse.mouseMove.planned";
    metadata: Readonly<Record<string, unknown>>;
  };
};

export type MouseMoveResult =
  | {
      ok: true;
      plan: MouseMovePlan;
      events: readonly string[];
    }
  | {
      ok: false;
      error: MouseMoveError;
      events: readonly string[];
    };

export const mouseMoveDescriptor = {
  tool: "computeruse.mouseMove",
  capability: "move-mouse",
  layer: "agent_executionEngine.basic_toolLayer.baseTools.computeruseBase.mouseEmulation",
  defaultDispatch: "dry-run",
  requiresTapApproval: true,
  unsafeSideEffects: false,
} as const;

const allowedCoordinateSpaces: readonly MouseMoveCoordinateSpace[] = ["screen", "window", "normalized"];

function cleanList(values: readonly string[] | undefined): readonly string[] {
  return [...new Set((values ?? []).map((value) => value.trim()).filter(Boolean))];
}

function failure(code: MouseMoveErrorCode, message: string, boundary: MouseMoveBoundary): MouseMoveResult {
  return {
    ok: false,
    error: {
      code,
      message,
      boundary,
      safeForRuntimeInspection: true,
      internalDetailExposed: false,
    },
    events: ["basicTool.computeruse.mouseMove.rejected"],
  };
}

function resolveAcceptedScopes(
  requestedScopes: readonly string[] | undefined,
  allowedScopes: readonly string[] | undefined,
): readonly string[] | MouseMoveResult {
  const requested = cleanList(requestedScopes);
  const allowed = cleanList(allowedScopes);

  if (requested.length === 0) {
    return [];
  }

  const denied = requested.filter((scope) => !allowed.includes(scope));
  if (denied.length > 0) {
    return failure("SCOPE_DENIED", `computeruse.mouseMove scope ${denied[0]} is outside runtime governance`, "scope");
  }

  return requested;
}

function isValidPoint(point: MouseMovePoint | undefined): point is MouseMovePoint {
  return (
    point !== undefined &&
    Number.isFinite(point.x) &&
    Number.isFinite(point.y) &&
    point.x >= 0 &&
    point.y >= 0
  );
}

function normalizeDuration(durationMs: number | undefined): number | MouseMoveResult {
  const resolved = durationMs ?? 0;
  if (!Number.isInteger(resolved) || resolved < 0) {
    return failure("INVALID_DURATION", "computeruse.mouseMove durationMs must be a non-negative integer", "input");
  }

  return resolved;
}

function normalizeCoordinateSpace(
  coordinateSpace: MouseMoveCoordinateSpace | undefined,
): MouseMoveCoordinateSpace | MouseMoveResult {
  const resolved = coordinateSpace ?? "screen";
  if (!allowedCoordinateSpaces.includes(resolved)) {
    return failure(
      "INVALID_COORDINATE_SPACE",
      "computeruse.mouseMove coordinateSpace must be screen, window, or normalized",
      "input",
    );
  }

  return resolved;
}

export function planMouseMove(request: MouseMoveRequest = {}): MouseMoveResult {
  if (request.target === undefined) {
    return failure("MISSING_TARGET", "computeruse.mouseMove requires a target point", "input");
  }

  if (!isValidPoint(request.target)) {
    return failure("INVALID_TARGET", "computeruse.mouseMove target must use finite non-negative coordinates", "input");
  }

  const durationMs = normalizeDuration(request.durationMs);
  if (typeof durationMs !== "number") {
    return durationMs;
  }

  const coordinateSpace = normalizeCoordinateSpace(request.coordinateSpace);
  if (typeof coordinateSpace !== "string") {
    return coordinateSpace;
  }

  if (request.dryRun === false) {
    return failure(
      "REAL_SIDE_EFFECT_NOT_ALLOWED",
      "first-round computeruse.mouseMove only supports dry-run planning",
      "governance",
    );
  }

  if (request.contract?.accepted === false) {
    return failure(
      "CONTRACT_REJECTED",
      request.contract.reason ?? "computeruse.mouseMove was rejected by runtime contract surface",
      "contract",
    );
  }

  if (request.governance?.accepted === false) {
    return failure(
      "GOVERNANCE_REJECTED",
      request.governance.reason ?? "computeruse.mouseMove was rejected by runtime governance",
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
      kind: "agentCore.basicTool.computeruse.mouseMove.plan",
      operation: "move-mouse",
      target: request.target,
      coordinateSpace,
      displayId: request.displayId?.trim() || undefined,
      durationMs,
      requiredPermission: "computeruse:mouse:move",
      requiresTapApproval: true,
      dispatch: "dry-run",
      dryRun: true,
      wouldMoveCursor: true,
      unsafeSideEffects: false,
      acceptedScopes,
      audit: {
        toolCallId: request.toolCallId?.trim() || "computeruse.mouseMove:dry-run",
        event: "basicTool.computeruse.mouseMove.planned",
        metadata: request.metadata ?? {},
      },
    },
    events: ["basicTool.computeruse.mouseMove.planned"],
  };
}
