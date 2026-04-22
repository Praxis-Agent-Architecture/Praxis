/*
 * 文件定位：Agent 执行引擎 / 基础工具原语层 / 基础工具集合 / 计算机使用基础工具 / 截图。
 * 核心目的：提供 计算机使用基础工具 / 截图 中的“区域截图”基础能力原语。
 * 能力要求1：需要定义该能力的输入、输出、错误、权限需求和可观测事件。
 * 能力要求2：这些基础工具是 Agent 成立的底层能力，不是 TAP 的最终高级工具库。
 * 能力要求3：后续 TAP 可以基于这些原语构建更强的工具编排、审批、替换和专业能力库。
 * 边界：保留 Agent 基础工具原语，不替代 TAP 的高级工具系统。
 * 对接：需要被 runtime.execEngine 拉起，并和 mainLoop、stateEngine、事件暴露、工具调用策略接通。
 * 实现提示：先补稳定类型契约、最小可测行为和清晰错误边界，再接入真实执行逻辑。
 */

export type RectangularSelectionScreenshotBoundary =
  | "input"
  | "contract"
  | "governance"
  | "scope"
  | "permission"
  | "resource";

export type RectangularSelectionScreenshotGate = {
  accepted: boolean;
  reason?: string;
};

export type RectangularSelectionScreenshotRect = {
  x: number;
  y: number;
  width: number;
  height: number;
};

export type RectangularSelectionScreenshotContext = {
  runtimeId?: string;
  invocationId?: string;
  dryRun?: boolean;
  permission?: RectangularSelectionScreenshotGate;
  contract?: RectangularSelectionScreenshotGate;
  governance?: RectangularSelectionScreenshotGate;
  requestedScopes?: readonly string[];
  allowedScopes?: readonly string[];
  auditMetadata?: Readonly<Record<string, unknown>>;
};

export type RectangularSelectionScreenshotRequest = {
  context?: RectangularSelectionScreenshotContext;
  displayId?: string;
  rect?: RectangularSelectionScreenshotRect;
  purpose?: string;
  outputFormat?: string;
  metadata?: Readonly<Record<string, unknown>>;
};

export type RectangularSelectionScreenshotErrorCode =
  | "MISSING_RUNTIME_ID"
  | "MISSING_PURPOSE"
  | "MISSING_RECT"
  | "INVALID_RECT"
  | "RECT_TOO_LARGE"
  | "INVALID_DISPLAY_ID"
  | "INVALID_OUTPUT_FORMAT"
  | "PERMISSION_REQUIRED"
  | "CONTRACT_REJECTED"
  | "GOVERNANCE_REJECTED"
  | "SCOPE_DENIED"
  | "REAL_SIDE_EFFECT_NOT_ALLOWED";

export type RectangularSelectionScreenshotError = {
  code: RectangularSelectionScreenshotErrorCode;
  message: string;
  boundary: RectangularSelectionScreenshotBoundary;
  safeForRuntimeInspection: true;
  internalDetailExposed: false;
};

export type RectangularSelectionScreenshotPlan = {
  toolId: "computeruse.rectangularSelectionScreenshot";
  capability: "capture-rectangular-selection-screenshot";
  runtimeId: string;
  invocationId: string;
  displayId: string;
  purpose: string;
  outputFormat: string;
  rect: RectangularSelectionScreenshotRect;
  requiredPermissions: readonly ["screen:read", "display:capture", "ui:selection"];
  requiresTapApproval: true;
  dispatch: "dry-run";
  dryRun: true;
  wouldCaptureScreen: true;
  screenshotCaptured: false;
  unsafeSideEffects: false;
  acceptedScopes: readonly string[];
  audit: {
    guard: "rectangular-selection-screenshot-permission";
    event: "basicTool.computeruse.rectangularSelectionScreenshot.planned";
    privacyReviewRequired: true;
    tapCanWrap: true;
    metadata: Readonly<Record<string, unknown>>;
  };
};

export type RectangularSelectionScreenshotResult =
  | {
      ok: true;
      plan: RectangularSelectionScreenshotPlan;
      events: readonly string[];
    }
  | {
      ok: false;
      error: RectangularSelectionScreenshotError;
      events: readonly string[];
    };

export const rectangularSelectionScreenshotDescriptor = {
  toolId: "computeruse.rectangularSelectionScreenshot",
  capability: "capture-rectangular-selection-screenshot",
  layer: "agent_executionEngine.basic_toolLayer.baseTools.computeruseBase.screenshot",
  defaultDispatch: "dry-run",
  defaultDisplayId: "primary-display",
  defaultOutputFormat: "image/png",
  maxAreaPx: 100_000_000,
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
  code: RectangularSelectionScreenshotErrorCode,
  message: string,
  boundary: RectangularSelectionScreenshotBoundary,
): RectangularSelectionScreenshotResult {
  return {
    ok: false,
    error: {
      code,
      message,
      boundary,
      safeForRuntimeInspection: true,
      internalDetailExposed: false,
    },
    events: ["basicTool.computeruse.rectangularSelectionScreenshot.rejected"],
  };
}

function normalizeSafeString(
  value: string | undefined,
  fallback: string,
  code: "INVALID_DISPLAY_ID" | "INVALID_OUTPUT_FORMAT",
  label: string,
): string | RectangularSelectionScreenshotResult {
  const normalized = value?.trim() || fallback;
  if (normalized.length === 0 || normalized.includes("\0")) {
    return failure(code, `rectangularSelectionScreenshot ${label} must be a safe string`, "input");
  }

  return normalized;
}

function normalizeRect(
  rect: RectangularSelectionScreenshotRect | undefined,
): RectangularSelectionScreenshotRect | RectangularSelectionScreenshotResult {
  if (rect === undefined) {
    return failure("MISSING_RECT", "rectangularSelectionScreenshot requires a rectangular selection", "input");
  }

  const normalized = {
    x: Math.round(rect.x),
    y: Math.round(rect.y),
    width: Math.round(rect.width),
    height: Math.round(rect.height),
  };

  if (
    !Number.isFinite(rect.x) ||
    !Number.isFinite(rect.y) ||
    !Number.isFinite(rect.width) ||
    !Number.isFinite(rect.height) ||
    normalized.x < 0 ||
    normalized.y < 0 ||
    normalized.width <= 0 ||
    normalized.height <= 0
  ) {
    return failure("INVALID_RECT", "rectangularSelectionScreenshot rect must use positive finite coordinates", "input");
  }

  if (normalized.width * normalized.height > rectangularSelectionScreenshotDescriptor.maxAreaPx) {
    return failure("RECT_TOO_LARGE", "rectangularSelectionScreenshot rect exceeds the resource limit", "resource");
  }

  return normalized;
}

function resolveScopes(
  requestedScopes: readonly string[] | undefined,
  allowedScopes: readonly string[] | undefined,
): string[] | RectangularSelectionScreenshotResult {
  const requested = cleanList(requestedScopes);
  const allowed = cleanList(allowedScopes);

  if (requested.length === 0) {
    return [];
  }

  const denied = requested.filter((scope) => !allowed.includes(scope));
  if (denied.length > 0) {
    return failure(
      "SCOPE_DENIED",
      `rectangularSelectionScreenshot scope ${denied[0]} is outside runtime governance`,
      "scope",
    );
  }

  return requested;
}

export function planRectangularSelectionScreenshot(
  request: RectangularSelectionScreenshotRequest = {},
): RectangularSelectionScreenshotResult {
  const runtimeId = request.context?.runtimeId?.trim();
  if (isBlank(runtimeId)) {
    return failure("MISSING_RUNTIME_ID", "rectangularSelectionScreenshot requires context.runtimeId for audit", "input");
  }

  if (isBlank(request.purpose)) {
    return failure("MISSING_PURPOSE", "rectangularSelectionScreenshot requires an explicit purpose", "input");
  }

  if (request.context?.dryRun === false) {
    return failure(
      "REAL_SIDE_EFFECT_NOT_ALLOWED",
      "first-round rectangularSelectionScreenshot only supports dry-run planning",
      "governance",
    );
  }

  if (request.context?.permission?.accepted !== true) {
    return failure(
      "PERMISSION_REQUIRED",
      request.context?.permission?.reason ?? "rectangularSelectionScreenshot requires an approved permission gate",
      "permission",
    );
  }

  if (request.context?.contract?.accepted === false) {
    return failure(
      "CONTRACT_REJECTED",
      request.context.contract.reason ?? "rectangularSelectionScreenshot was rejected by contract surface",
      "contract",
    );
  }

  if (request.context?.governance?.accepted === false) {
    return failure(
      "GOVERNANCE_REJECTED",
      request.context.governance.reason ?? "rectangularSelectionScreenshot was rejected by runtime governance",
      "governance",
    );
  }

  const rect = normalizeRect(request.rect);
  if ("ok" in rect) {
    return rect;
  }

  const displayId = normalizeSafeString(
    request.displayId,
    rectangularSelectionScreenshotDescriptor.defaultDisplayId,
    "INVALID_DISPLAY_ID",
    "displayId",
  );
  if (typeof displayId !== "string") {
    return displayId;
  }

  const outputFormat = normalizeSafeString(
    request.outputFormat,
    rectangularSelectionScreenshotDescriptor.defaultOutputFormat,
    "INVALID_OUTPUT_FORMAT",
    "outputFormat",
  );
  if (typeof outputFormat !== "string") {
    return outputFormat;
  }

  const acceptedScopes = resolveScopes(request.context?.requestedScopes, request.context?.allowedScopes);
  if (!Array.isArray(acceptedScopes)) {
    return acceptedScopes;
  }

  return {
    ok: true,
    plan: {
      toolId: "computeruse.rectangularSelectionScreenshot",
      capability: "capture-rectangular-selection-screenshot",
      runtimeId: runtimeId ?? "",
      invocationId: request.context?.invocationId?.trim() || "rectangularSelectionScreenshot:dry-run",
      displayId,
      purpose: request.purpose?.trim() ?? "",
      outputFormat,
      rect,
      requiredPermissions: ["screen:read", "display:capture", "ui:selection"],
      requiresTapApproval: true,
      dispatch: "dry-run",
      dryRun: true,
      wouldCaptureScreen: true,
      screenshotCaptured: false,
      unsafeSideEffects: false,
      acceptedScopes,
      audit: {
        guard: "rectangular-selection-screenshot-permission",
        event: "basicTool.computeruse.rectangularSelectionScreenshot.planned",
        privacyReviewRequired: true,
        tapCanWrap: true,
        metadata: {
          ...(request.context?.auditMetadata ?? {}),
          ...(request.metadata ?? {}),
        },
      },
    },
    events: ["basicTool.computeruse.rectangularSelectionScreenshot.planned"],
  };
}
