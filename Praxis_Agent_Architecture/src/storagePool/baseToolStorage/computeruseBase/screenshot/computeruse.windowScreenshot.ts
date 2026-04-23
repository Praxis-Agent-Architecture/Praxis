/*
 * 文件定位：Agent 执行引擎 / 基础工具原语层 / 基础工具集合 / 计算机使用基础工具 / 截图。
 * 核心目的：提供 计算机使用基础工具 / 截图 中的“窗口截图”基础能力原语。
 * 能力要求1：需要定义该能力的输入、输出、错误、权限需求和可观测事件。
 * 能力要求2：这些基础工具是 Agent 成立的底层能力，不是 TAP 的最终高级工具库。
 * 能力要求3：后续 TAP 可以基于这些原语构建更强的工具编排、审批、替换和专业能力库。
 * 边界：保留 Agent 基础工具原语，不替代 TAP 的高级工具系统。
 * 对接：需要被 runtime.execEngine 拉起，并和 mainLoop、stateEngine、事件暴露、工具调用策略接通。
 * 实现提示：先补稳定类型契约、最小可测行为和清晰错误边界，再接入真实执行逻辑。
 */

export type WindowScreenshotBoundary = "input" | "contract" | "governance" | "scope" | "permission" | "resource";

export type WindowScreenshotGate = {
  accepted: boolean;
  reason?: string;
};

export type WindowScreenshotTarget = {
  windowRef: string;
  titleHint?: string;
};

export type WindowScreenshotRequest = {
  runtimeId?: string;
  invocationId?: string;
  target?: WindowScreenshotTarget;
  purpose?: string;
  outputFormat?: string;
  includeWindowFrame?: boolean;
  requestedScopes?: readonly string[];
  allowedScopes?: readonly string[];
  dryRun?: boolean;
  permission?: WindowScreenshotGate;
  contract?: WindowScreenshotGate;
  governance?: WindowScreenshotGate;
  metadata?: Readonly<Record<string, unknown>>;
};

export type WindowScreenshotErrorCode =
  | "MISSING_RUNTIME_ID"
  | "MISSING_WINDOW_REF"
  | "MISSING_PURPOSE"
  | "INVALID_WINDOW_REF"
  | "INVALID_TITLE_HINT"
  | "INVALID_OUTPUT_FORMAT"
  | "PERMISSION_REQUIRED"
  | "CONTRACT_REJECTED"
  | "GOVERNANCE_REJECTED"
  | "SCOPE_DENIED"
  | "REAL_SIDE_EFFECT_NOT_ALLOWED";

export type WindowScreenshotError = {
  code: WindowScreenshotErrorCode;
  message: string;
  boundary: WindowScreenshotBoundary;
  safeForRuntimeInspection: true;
  internalDetailExposed: false;
};

export type WindowScreenshotPlan = {
  toolKind: "computeruse.windowScreenshot";
  runtimeId: string;
  invocationId: string;
  target: WindowScreenshotTarget;
  purpose: string;
  outputFormat: string;
  includeWindowFrame: boolean;
  permissions: readonly ["screen:read:dry-run", "window:inspect:dry-run"];
  acceptedScopes: readonly string[];
  dispatch: "dry-run";
  dryRun: true;
  screenshotCaptured: false;
  unsafeSideEffects: false;
  audit: {
    guard: "window-visibility-and-privacy-permission";
    event: "basicTool.computeruse.windowScreenshot.planned";
    governanceRequired: true;
    tapCanWrap: true;
    metadata: Readonly<Record<string, unknown>>;
  };
};

export type WindowScreenshotResult =
  | {
      ok: true;
      plan: WindowScreenshotPlan;
      events: readonly string[];
    }
  | {
      ok: false;
      error: WindowScreenshotError;
      events: readonly string[];
    };

export const windowScreenshotDescriptor = {
  toolKind: "computeruse.windowScreenshot",
  capability: "capture-window-screenshot",
  layer: "agent_executionEngine.basic_toolLayer.baseTools.computeruseBase.screenshot",
  defaultDispatch: "dry-run",
  defaultOutputFormat: "image/png",
  requiresPermission: true,
  unsafeSideEffects: false,
} as const;

function hasText(value: string | undefined): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

function cleanList(values: readonly string[] | undefined): string[] {
  return [...new Set((values ?? []).map((value) => value.trim()).filter(Boolean))];
}

function failure(
  code: WindowScreenshotErrorCode,
  message: string,
  boundary: WindowScreenshotBoundary,
): WindowScreenshotResult {
  return {
    ok: false,
    error: {
      code,
      message,
      boundary,
      safeForRuntimeInspection: true,
      internalDetailExposed: false,
    },
    events: ["basicTool.computeruse.windowScreenshot.rejected"],
  };
}

function resolveScopes(
  requestedScopes: readonly string[] | undefined,
  allowedScopes: readonly string[] | undefined,
): string[] | WindowScreenshotResult {
  const requested = cleanList(requestedScopes);
  const allowed = cleanList(allowedScopes);

  if (requested.length === 0) {
    return [];
  }

  const denied = requested.filter((scope) => !allowed.includes(scope));
  if (denied.length > 0) {
    return failure("SCOPE_DENIED", `window screenshot scope ${denied[0]} is outside runtime governance`, "scope");
  }

  return requested;
}

function normalizeTarget(target: WindowScreenshotTarget | undefined): WindowScreenshotTarget | WindowScreenshotResult {
  if (!hasText(target?.windowRef)) {
    return failure("MISSING_WINDOW_REF", "computeruse.windowScreenshot requires target.windowRef", "input");
  }

  const windowRef = target.windowRef.trim();
  if (windowRef.includes("\0")) {
    return failure("INVALID_WINDOW_REF", "computeruse.windowScreenshot windowRef must be a safe string", "input");
  }

  const titleHint = target.titleHint?.trim() || undefined;
  if (titleHint?.includes("\0") === true) {
    return failure("INVALID_TITLE_HINT", "computeruse.windowScreenshot titleHint must be a safe string", "input");
  }

  return { windowRef, titleHint };
}

export function planWindowScreenshot(request: WindowScreenshotRequest = {}): WindowScreenshotResult {
  if (!hasText(request.runtimeId)) {
    return failure("MISSING_RUNTIME_ID", "computeruse.windowScreenshot requires runtimeId", "input");
  }

  if (!hasText(request.purpose)) {
    return failure("MISSING_PURPOSE", "computeruse.windowScreenshot requires an explicit purpose", "input");
  }

  if (request.dryRun === false) {
    return failure(
      "REAL_SIDE_EFFECT_NOT_ALLOWED",
      "first-round computeruse.windowScreenshot only creates a dry-run guard and audit plan",
      "governance",
    );
  }

  if (request.permission?.accepted !== true) {
    return failure(
      "PERMISSION_REQUIRED",
      request.permission?.reason ?? "computeruse.windowScreenshot requires an approved permission gate",
      "permission",
    );
  }

  if (request.contract?.accepted === false) {
    return failure(
      "CONTRACT_REJECTED",
      request.contract.reason ?? "computeruse.windowScreenshot was rejected by runtime contract surface",
      "contract",
    );
  }

  if (request.governance?.accepted === false) {
    return failure(
      "GOVERNANCE_REJECTED",
      request.governance.reason ?? "computeruse.windowScreenshot was rejected by runtime governance",
      "governance",
    );
  }

  const target = normalizeTarget(request.target);
  if ("ok" in target) {
    return target;
  }

  const outputFormat = request.outputFormat?.trim() || windowScreenshotDescriptor.defaultOutputFormat;
  if (outputFormat.includes("\0")) {
    return failure("INVALID_OUTPUT_FORMAT", "computeruse.windowScreenshot outputFormat must be a safe string", "input");
  }

  const acceptedScopes = resolveScopes(request.requestedScopes, request.allowedScopes);
  if (!Array.isArray(acceptedScopes)) {
    return acceptedScopes;
  }

  const runtimeId = request.runtimeId.trim();

  return {
    ok: true,
    plan: {
      toolKind: "computeruse.windowScreenshot",
      runtimeId,
      invocationId: request.invocationId?.trim() || `${runtimeId}:computeruse.windowScreenshot:${target.windowRef}`,
      target,
      purpose: request.purpose.trim(),
      outputFormat,
      includeWindowFrame: request.includeWindowFrame ?? true,
      permissions: ["screen:read:dry-run", "window:inspect:dry-run"],
      acceptedScopes,
      dispatch: "dry-run",
      dryRun: true,
      screenshotCaptured: false,
      unsafeSideEffects: false,
      audit: {
        guard: "window-visibility-and-privacy-permission",
        event: "basicTool.computeruse.windowScreenshot.planned",
        governanceRequired: true,
        tapCanWrap: true,
        metadata: request.metadata ?? {},
      },
    },
    events: ["basicTool.computeruse.windowScreenshot.planned"],
  };
}
