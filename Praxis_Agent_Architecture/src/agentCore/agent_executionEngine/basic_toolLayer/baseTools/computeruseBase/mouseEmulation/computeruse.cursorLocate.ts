/*
 * 文件定位：Agent 执行引擎 / 基础工具原语层 / 基础工具集合 / 计算机使用基础工具 / 鼠标模拟。
 * 核心目的：提供 计算机使用基础工具 / 鼠标模拟 中的“定位光标”基础能力原语。
 * 能力要求1：需要定义该能力的输入、输出、错误、权限需求和可观测事件。
 * 能力要求2：这些基础工具是 Agent 成立的底层能力，不是 TAP 的最终高级工具库。
 * 能力要求3：后续 TAP 可以基于这些原语构建更强的工具编排、审批、替换和专业能力库。
 * 边界：保留 Agent 基础工具原语，不替代 TAP 的高级工具系统。
 * 对接：需要被 runtime.execEngine 拉起，并和 mainLoop、stateEngine、事件暴露、工具调用策略接通。
 * 实现提示：先补稳定类型契约、最小可测行为和清晰错误边界，再接入真实执行逻辑。
 */

export type CursorLocateBoundary = "input" | "contract" | "governance" | "scope" | "execution";

export type CursorLocateGate = {
  accepted: boolean;
  reason?: string;
};

export type CursorCoordinateSpace = "screen" | "window" | "normalized";

export type CursorPosition = {
  x: number;
  y: number;
  coordinateSpace: CursorCoordinateSpace;
  displayId?: string;
};

export type CursorLocateSnapshot = {
  position: CursorPosition;
  capturedAt?: string;
};

export type CursorLocateProvider = (request: {
  coordinateSpace: CursorCoordinateSpace;
  displayId?: string;
  toolCallId: string;
}) => CursorLocateSnapshot | Promise<CursorLocateSnapshot>;

export type CursorLocateRequest = {
  toolCallId?: string;
  coordinateSpace?: CursorCoordinateSpace;
  displayId?: string;
  requestedScopes?: readonly string[];
  allowedScopes?: readonly string[];
  dryRun?: boolean;
  contract?: CursorLocateGate;
  governance?: CursorLocateGate;
  locator?: CursorLocateProvider;
  metadata?: Readonly<Record<string, unknown>>;
};

export type CursorLocateErrorCode =
  | "CONTRACT_REJECTED"
  | "GOVERNANCE_REJECTED"
  | "SCOPE_DENIED"
  | "INVALID_COORDINATE_SPACE"
  | "LOCATOR_NOT_INJECTED"
  | "LOCATOR_REJECTED"
  | "INVALID_CURSOR_POSITION";

export type CursorLocateError = {
  code: CursorLocateErrorCode;
  message: string;
  boundary: CursorLocateBoundary;
  safeForRuntimeInspection: true;
  internalDetailExposed: false;
};

export type CursorLocateAudit = {
  tool: "computeruse.cursorLocate";
  toolCallId: string;
  requestedScopes: readonly string[];
  acceptedScopes: readonly string[];
  dryRun: boolean;
  unsafeSideEffects: false;
  metadata: Readonly<Record<string, unknown>>;
};

export type CursorLocatePlan = {
  kind: "agentCore.basicTool.computeruse.cursorLocate.plan";
  operation: "locate-cursor";
  coordinateSpace: CursorCoordinateSpace;
  displayId?: string;
  requiredPermission: "computeruse:cursor:read";
  requiresTapApproval: true;
  dispatch: "dry-run" | "injected-locator";
  readsCursorDirectly: false;
  dryRun: boolean;
  unsafeSideEffects: false;
};

export type CursorLocateResult =
  | {
      ok: true;
      plan: CursorLocatePlan;
      audit: CursorLocateAudit;
      snapshot?: CursorLocateSnapshot;
      events: readonly string[];
    }
  | {
      ok: false;
      error: CursorLocateError;
      events: readonly string[];
    };

export const cursorLocateDescriptor = {
  tool: "computeruse.cursorLocate",
  capability: "locate-cursor",
  layer: "agent_executionEngine.basic_toolLayer.baseTools.computeruseBase.mouseEmulation",
  defaultDispatch: "dry-run",
  requiresTapApproval: true,
  unsafeSideEffects: false,
} as const;

const allowedCoordinateSpaces: readonly CursorCoordinateSpace[] = ["screen", "window", "normalized"];

function cleanList(values: readonly string[] | undefined): readonly string[] {
  return [...new Set((values ?? []).map((value) => value.trim()).filter(Boolean))];
}

function failure(
  code: CursorLocateErrorCode,
  message: string,
  boundary: CursorLocateBoundary,
): CursorLocateResult {
  return {
    ok: false,
    error: {
      code,
      message,
      boundary,
      safeForRuntimeInspection: true,
      internalDetailExposed: false,
    },
    events: ["basicTool.computeruse.cursorLocate.rejected"],
  };
}

function resolveAcceptedScopes(
  requestedScopes: readonly string[] | undefined,
  allowedScopes: readonly string[] | undefined,
): readonly string[] | CursorLocateResult {
  const requested = cleanList(requestedScopes);
  const allowed = cleanList(allowedScopes);

  if (requested.length === 0) {
    return [];
  }

  const denied = requested.filter((scope) => !allowed.includes(scope));
  if (denied.length > 0) {
    return failure(
      "SCOPE_DENIED",
      `computeruse.cursorLocate scope ${denied[0]} is outside runtime governance`,
      "scope",
    );
  }

  return requested;
}

function isValidPosition(position: CursorPosition | undefined): boolean {
  return (
    position !== undefined &&
    Number.isFinite(position.x) &&
    Number.isFinite(position.y) &&
    position.x >= 0 &&
    position.y >= 0
  );
}

function normalizeCoordinateSpace(
  coordinateSpace: CursorCoordinateSpace | undefined,
): CursorCoordinateSpace | CursorLocateResult {
  const resolved = coordinateSpace ?? "screen";
  if (!allowedCoordinateSpaces.includes(resolved)) {
    return failure(
      "INVALID_COORDINATE_SPACE",
      "computeruse.cursorLocate coordinateSpace must be screen, window, or normalized",
      "input",
    );
  }

  return resolved;
}

export async function planCursorLocate(request: CursorLocateRequest = {}): Promise<CursorLocateResult> {
  if (request.contract?.accepted === false) {
    return failure(
      "CONTRACT_REJECTED",
      request.contract.reason ?? "computeruse.cursorLocate was rejected by runtime contract surface",
      "contract",
    );
  }

  if (request.governance?.accepted === false) {
    return failure(
      "GOVERNANCE_REJECTED",
      request.governance.reason ?? "computeruse.cursorLocate was rejected by runtime governance",
      "governance",
    );
  }

  const acceptedScopes = resolveAcceptedScopes(request.requestedScopes, request.allowedScopes);
  if ("ok" in acceptedScopes) {
    return acceptedScopes;
  }

  const dispatch = request.dryRun === false ? "injected-locator" : "dry-run";
  if (dispatch === "injected-locator" && request.locator === undefined) {
    return failure(
      "LOCATOR_NOT_INJECTED",
      "computeruse.cursorLocate requires an injected locator when dryRun is false",
      "execution",
    );
  }

  const coordinateSpace = normalizeCoordinateSpace(request.coordinateSpace);
  if (typeof coordinateSpace !== "string") {
    return coordinateSpace;
  }

  const displayId = request.displayId?.trim() || undefined;
  const toolCallId = request.toolCallId?.trim() || "computeruse.cursorLocate:dry-run";
  const plan: CursorLocatePlan = {
    kind: "agentCore.basicTool.computeruse.cursorLocate.plan",
    operation: "locate-cursor",
    coordinateSpace,
    displayId,
    requiredPermission: "computeruse:cursor:read",
    requiresTapApproval: true,
    dispatch,
    readsCursorDirectly: false,
    dryRun: dispatch === "dry-run",
    unsafeSideEffects: false,
  };
  const audit: CursorLocateAudit = {
    tool: "computeruse.cursorLocate",
    toolCallId,
    requestedScopes: cleanList(request.requestedScopes),
    acceptedScopes,
    dryRun: dispatch === "dry-run",
    unsafeSideEffects: false,
    metadata: request.metadata ?? {},
  };

  if (dispatch === "dry-run") {
    return { ok: true, plan, audit, events: ["basicTool.computeruse.cursorLocate.planned"] };
  }

  try {
    const snapshot = await request.locator?.({ coordinateSpace, displayId, toolCallId });
    if (!isValidPosition(snapshot?.position)) {
      return failure(
        "INVALID_CURSOR_POSITION",
        "computeruse.cursorLocate injected locator returned an invalid cursor position",
        "execution",
      );
    }

    return {
      ok: true,
      plan,
      audit,
      snapshot,
      events: ["basicTool.computeruse.cursorLocate.injectedLocatorCompleted"],
    };
  } catch {
    return failure(
      "LOCATOR_REJECTED",
      "computeruse.cursorLocate injected locator rejected the request",
      "execution",
    );
  }
}
