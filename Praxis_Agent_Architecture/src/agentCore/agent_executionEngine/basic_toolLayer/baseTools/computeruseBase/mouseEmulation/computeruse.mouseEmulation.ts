/*
 * 文件定位：Agent 执行引擎 / 基础工具原语层 / 基础工具集合 / 计算机使用基础工具 / 鼠标模拟。
 * 核心目的：提供 计算机使用基础工具 / 鼠标模拟 中的“模拟鼠标操作”基础能力原语。
 * 能力要求1：需要定义该能力的输入、输出、错误、权限需求和可观测事件。
 * 能力要求2：这些基础工具是 Agent 成立的底层能力，不是 TAP 的最终高级工具库。
 * 能力要求3：后续 TAP 可以基于这些原语构建更强的工具编排、审批、替换和专业能力库。
 * 边界：保留 Agent 基础工具原语，不替代 TAP 的高级工具系统。
 * 对接：需要被 runtime.execEngine 拉起，并和 mainLoop、stateEngine、事件暴露、工具调用策略接通。
 * 实现提示：先补稳定类型契约、最小可测行为和清晰错误边界，再接入真实执行逻辑。
 */

export type MouseEmulationBoundary = "input" | "contract" | "governance" | "scope";

export type MouseEmulationGate = {
  accepted: boolean;
  reason?: string;
};

export type MouseEmulationPoint = {
  x: number;
  y: number;
};

export type MouseEmulationCoordinateSpace = "screen" | "window" | "normalized";

export type MouseEmulationStep =
  | {
      kind: "locate";
      coordinateSpace?: MouseEmulationCoordinateSpace;
      displayId?: string;
    }
  | {
      kind: "move";
      target: MouseEmulationPoint;
      coordinateSpace?: MouseEmulationCoordinateSpace;
      displayId?: string;
      durationMs?: number;
    }
  | {
      kind: "click";
      button?: "left" | "right" | "middle" | "back" | "forward";
      clickCount?: number;
      at?: MouseEmulationPoint;
      coordinateSpace?: MouseEmulationCoordinateSpace;
      displayId?: string;
    };

export type MouseEmulationRequest = {
  toolCallId?: string;
  steps?: readonly MouseEmulationStep[];
  maxSteps?: number;
  requestedScopes?: readonly string[];
  allowedScopes?: readonly string[];
  dryRun?: boolean;
  contract?: MouseEmulationGate;
  governance?: MouseEmulationGate;
  metadata?: Readonly<Record<string, unknown>>;
};

export type MouseEmulationErrorCode =
  | "MISSING_STEPS"
  | "STEP_LIMIT_EXCEEDED"
  | "INVALID_STEP"
  | "INVALID_TARGET"
  | "INVALID_CLICK_COUNT"
  | "INVALID_COORDINATE_SPACE"
  | "CONTRACT_REJECTED"
  | "GOVERNANCE_REJECTED"
  | "SCOPE_DENIED"
  | "REAL_SIDE_EFFECT_NOT_ALLOWED";

export type MouseEmulationError = {
  code: MouseEmulationErrorCode;
  message: string;
  boundary: MouseEmulationBoundary;
  safeForRuntimeInspection: true;
  internalDetailExposed: false;
};

export type MouseEmulationPlannedStep = MouseEmulationStep & {
  index: number;
  dispatch: "dry-run";
  unsafeSideEffects: false;
};

export type MouseEmulationPlan = {
  kind: "agentCore.basicTool.computeruse.mouseEmulation.plan";
  operation: "simulate-mouse-operations";
  steps: readonly MouseEmulationPlannedStep[];
  requiredPermission: "computeruse:mouse:emulate";
  requiresTapApproval: true;
  dispatch: "dry-run";
  dryRun: true;
  wouldEmulateMouse: true;
  unsafeSideEffects: false;
  acceptedScopes: readonly string[];
  audit: {
    toolCallId: string;
    event: "basicTool.computeruse.mouseEmulation.planned";
    metadata: Readonly<Record<string, unknown>>;
  };
};

export type MouseEmulationResult =
  | {
      ok: true;
      plan: MouseEmulationPlan;
      events: readonly string[];
    }
  | {
      ok: false;
      error: MouseEmulationError;
      events: readonly string[];
    };

export const mouseEmulationDescriptor = {
  tool: "computeruse.mouseEmulation",
  capability: "simulate-mouse-operations",
  layer: "agent_executionEngine.basic_toolLayer.baseTools.computeruseBase.mouseEmulation",
  defaultDispatch: "dry-run",
  requiresTapApproval: true,
  unsafeSideEffects: false,
} as const;

const allowedClickButtons = ["left", "right", "middle", "back", "forward"] as const;
const allowedCoordinateSpaces: readonly MouseEmulationCoordinateSpace[] = ["screen", "window", "normalized"];

function cleanList(values: readonly string[] | undefined): readonly string[] {
  return [...new Set((values ?? []).map((value) => value.trim()).filter(Boolean))];
}

function failure(
  code: MouseEmulationErrorCode,
  message: string,
  boundary: MouseEmulationBoundary,
): MouseEmulationResult {
  return {
    ok: false,
    error: {
      code,
      message,
      boundary,
      safeForRuntimeInspection: true,
      internalDetailExposed: false,
    },
    events: ["basicTool.computeruse.mouseEmulation.rejected"],
  };
}

function resolveAcceptedScopes(
  requestedScopes: readonly string[] | undefined,
  allowedScopes: readonly string[] | undefined,
): readonly string[] | MouseEmulationResult {
  const requested = cleanList(requestedScopes);
  const allowed = cleanList(allowedScopes);

  if (requested.length === 0) {
    return [];
  }

  const denied = requested.filter((scope) => !allowed.includes(scope));
  if (denied.length > 0) {
    return failure(
      "SCOPE_DENIED",
      `computeruse.mouseEmulation scope ${denied[0]} is outside runtime governance`,
      "scope",
    );
  }

  return requested;
}

function isValidPoint(point: MouseEmulationPoint | undefined): boolean {
  return (
    point === undefined ||
    (Number.isFinite(point.x) && Number.isFinite(point.y) && point.x >= 0 && point.y >= 0)
  );
}

function isValidClickCount(clickCount: number | undefined): boolean {
  return clickCount === undefined || (Number.isInteger(clickCount) && clickCount >= 1 && clickCount <= 3);
}

function isValidDuration(durationMs: number | undefined): boolean {
  return durationMs === undefined || (Number.isInteger(durationMs) && durationMs >= 0);
}

function isValidCoordinateSpace(coordinateSpace: MouseEmulationCoordinateSpace | undefined): boolean {
  return coordinateSpace === undefined || allowedCoordinateSpaces.includes(coordinateSpace);
}

function validateStep(step: MouseEmulationStep, index: number): MouseEmulationResult | undefined {
  if (!isValidCoordinateSpace(step.coordinateSpace)) {
    return failure(
      "INVALID_COORDINATE_SPACE",
      `computeruse.mouseEmulation step ${index} coordinateSpace must be screen, window, or normalized`,
      "input",
    );
  }

  if (step.kind === "locate") {
    return undefined;
  }

  if (step.kind === "move") {
    if (!isValidPoint(step.target)) {
      return failure(
        "INVALID_TARGET",
        `computeruse.mouseEmulation step ${index} move target must use finite non-negative coordinates`,
        "input",
      );
    }

    if (!isValidDuration(step.durationMs)) {
      return failure("INVALID_STEP", `computeruse.mouseEmulation step ${index} durationMs is invalid`, "input");
    }

    return undefined;
  }

  if (step.kind === "click") {
    if (step.button !== undefined && !allowedClickButtons.includes(step.button)) {
      return failure("INVALID_STEP", `computeruse.mouseEmulation step ${index} click button is invalid`, "input");
    }

    if (!isValidClickCount(step.clickCount)) {
      return failure("INVALID_CLICK_COUNT", `computeruse.mouseEmulation step ${index} clickCount is invalid`, "input");
    }

    if (!isValidPoint(step.at)) {
      return failure(
        "INVALID_TARGET",
        `computeruse.mouseEmulation step ${index} click target must use finite non-negative coordinates`,
        "input",
      );
    }

    return undefined;
  }

  return failure("INVALID_STEP", `computeruse.mouseEmulation step ${index} kind is not supported`, "input");
}

export function planMouseEmulation(request: MouseEmulationRequest = {}): MouseEmulationResult {
  if (request.steps === undefined || request.steps.length === 0) {
    return failure("MISSING_STEPS", "computeruse.mouseEmulation requires at least one mouse step", "input");
  }

  const maxSteps = request.maxSteps ?? 16;
  if (!Number.isInteger(maxSteps) || maxSteps < 1 || request.steps.length > maxSteps) {
    return failure(
      "STEP_LIMIT_EXCEEDED",
      "computeruse.mouseEmulation steps must stay within the declared runtime step limit",
      "scope",
    );
  }

  if (request.dryRun === false) {
    return failure(
      "REAL_SIDE_EFFECT_NOT_ALLOWED",
      "first-round computeruse.mouseEmulation only supports dry-run planning",
      "governance",
    );
  }

  if (request.contract?.accepted === false) {
    return failure(
      "CONTRACT_REJECTED",
      request.contract.reason ?? "computeruse.mouseEmulation was rejected by runtime contract surface",
      "contract",
    );
  }

  if (request.governance?.accepted === false) {
    return failure(
      "GOVERNANCE_REJECTED",
      request.governance.reason ?? "computeruse.mouseEmulation was rejected by runtime governance",
      "governance",
    );
  }

  const acceptedScopes = resolveAcceptedScopes(request.requestedScopes, request.allowedScopes);
  if ("ok" in acceptedScopes) {
    return acceptedScopes;
  }

  const plannedSteps: MouseEmulationPlannedStep[] = [];
  for (const [index, step] of request.steps.entries()) {
    const invalid = validateStep(step, index);
    if (invalid !== undefined) {
      return invalid;
    }

    plannedSteps.push({ ...step, index, dispatch: "dry-run", unsafeSideEffects: false });
  }

  return {
    ok: true,
    plan: {
      kind: "agentCore.basicTool.computeruse.mouseEmulation.plan",
      operation: "simulate-mouse-operations",
      steps: plannedSteps,
      requiredPermission: "computeruse:mouse:emulate",
      requiresTapApproval: true,
      dispatch: "dry-run",
      dryRun: true,
      wouldEmulateMouse: true,
      unsafeSideEffects: false,
      acceptedScopes,
      audit: {
        toolCallId: request.toolCallId?.trim() || "computeruse.mouseEmulation:dry-run",
        event: "basicTool.computeruse.mouseEmulation.planned",
        metadata: request.metadata ?? {},
      },
    },
    events: ["basicTool.computeruse.mouseEmulation.planned"],
  };
}
