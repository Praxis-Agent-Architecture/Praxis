/*
 * 文件定位：Agent 执行引擎 / 基础工具原语层 / 基础工具集合 / 计算机使用基础工具 / 截图。
 * 核心目的：提供 计算机使用基础工具 / 截图 中的“自由截图”基础能力原语。
 * 能力要求1：需要定义该能力的输入、输出、错误、权限需求和可观测事件。
 * 能力要求2：这些基础工具是 Agent 成立的底层能力，不是 TAP 的最终高级工具库。
 * 能力要求3：后续 TAP 可以基于这些原语构建更强的工具编排、审批、替换和专业能力库。
 * 边界：保留 Agent 基础工具原语，不替代 TAP 的高级工具系统。
 * 对接：需要被 runtime.execEngine 拉起，并和 mainLoop、stateEngine、事件暴露、工具调用策略接通。
 * 实现提示：先补稳定类型契约、最小可测行为和清晰错误边界，再接入真实执行逻辑。
 */

export type FreeformScreenshotBoundary = "input" | "contract" | "governance" | "scope" | "permission" | "resource";

export type FreeformScreenshotGate = {
  accepted: boolean;
  reason?: string;
};

export type FreeformScreenshotPoint = {
  x: number;
  y: number;
};

export type FreeformScreenshotContext = {
  runtimeId?: string;
  invocationId?: string;
  dryRun?: boolean;
  permission?: FreeformScreenshotGate;
  contract?: FreeformScreenshotGate;
  governance?: FreeformScreenshotGate;
  requestedScopes?: readonly string[];
  allowedScopes?: readonly string[];
  auditMetadata?: Readonly<Record<string, unknown>>;
};

export type FreeformScreenshotRequest = {
  context?: FreeformScreenshotContext;
  displayId?: string;
  points?: readonly FreeformScreenshotPoint[];
  purpose?: string;
  outputFormat?: string;
  metadata?: Readonly<Record<string, unknown>>;
};

export type FreeformScreenshotErrorCode =
  | "MISSING_RUNTIME_ID"
  | "MISSING_PURPOSE"
  | "MISSING_SELECTION_POINTS"
  | "INVALID_SELECTION_POINT"
  | "TOO_MANY_SELECTION_POINTS"
  | "INVALID_DISPLAY_ID"
  | "INVALID_OUTPUT_FORMAT"
  | "PERMISSION_REQUIRED"
  | "CONTRACT_REJECTED"
  | "GOVERNANCE_REJECTED"
  | "SCOPE_DENIED"
  | "REAL_SIDE_EFFECT_NOT_ALLOWED";

export type FreeformScreenshotError = {
  code: FreeformScreenshotErrorCode;
  message: string;
  boundary: FreeformScreenshotBoundary;
  safeForRuntimeInspection: true;
  internalDetailExposed: false;
};

export type FreeformScreenshotPlan = {
  toolId: "computeruse.freeformScreenshot";
  capability: "capture-freeform-screenshot";
  runtimeId: string;
  invocationId: string;
  displayId: string;
  purpose: string;
  outputFormat: string;
  points: readonly FreeformScreenshotPoint[];
  boundingBox: {
    x: number;
    y: number;
    width: number;
    height: number;
  };
  requiredPermissions: readonly ["screen:read", "display:capture", "ui:selection"];
  requiresTapApproval: true;
  dispatch: "dry-run";
  dryRun: true;
  wouldCaptureScreen: true;
  screenshotCaptured: false;
  unsafeSideEffects: false;
  acceptedScopes: readonly string[];
  audit: {
    guard: "freeform-screenshot-permission";
    event: "basicTool.computeruse.freeformScreenshot.planned";
    privacyReviewRequired: true;
    tapCanWrap: true;
    metadata: Readonly<Record<string, unknown>>;
  };
};

export type FreeformScreenshotResult =
  | {
      ok: true;
      plan: FreeformScreenshotPlan;
      events: readonly string[];
    }
  | {
      ok: false;
      error: FreeformScreenshotError;
      events: readonly string[];
    };

export const freeformScreenshotDescriptor = {
  toolId: "computeruse.freeformScreenshot",
  capability: "capture-freeform-screenshot",
  layer: "agent_executionEngine.basic_toolLayer.baseTools.computeruseBase.screenshot",
  defaultDispatch: "dry-run",
  defaultDisplayId: "primary-display",
  defaultOutputFormat: "image/png",
  maxSelectionPoints: 128,
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
  code: FreeformScreenshotErrorCode,
  message: string,
  boundary: FreeformScreenshotBoundary,
): FreeformScreenshotResult {
  return {
    ok: false,
    error: {
      code,
      message,
      boundary,
      safeForRuntimeInspection: true,
      internalDetailExposed: false,
    },
    events: ["basicTool.computeruse.freeformScreenshot.rejected"],
  };
}

function normalizeSafeString(
  value: string | undefined,
  fallback: string,
  code: "INVALID_DISPLAY_ID" | "INVALID_OUTPUT_FORMAT",
  label: string,
): string | FreeformScreenshotResult {
  const normalized = value?.trim() || fallback;
  if (normalized.length === 0 || normalized.includes("\0")) {
    return failure(code, `freeformScreenshot ${label} must be a safe string`, "input");
  }

  return normalized;
}

function normalizePoints(
  points: readonly FreeformScreenshotPoint[] | undefined,
): readonly FreeformScreenshotPoint[] | FreeformScreenshotResult {
  if (points === undefined || points.length < 3) {
    return failure("MISSING_SELECTION_POINTS", "freeformScreenshot requires at least three selection points", "input");
  }

  if (points.length > freeformScreenshotDescriptor.maxSelectionPoints) {
    return failure("TOO_MANY_SELECTION_POINTS", "freeformScreenshot selection exceeds the point limit", "resource");
  }

  const normalized: FreeformScreenshotPoint[] = [];
  for (const point of points) {
    if (
      !Number.isFinite(point.x) ||
      !Number.isFinite(point.y) ||
      point.x < 0 ||
      point.y < 0 ||
      point.x > 100_000 ||
      point.y > 100_000
    ) {
      return failure(
        "INVALID_SELECTION_POINT",
        "freeformScreenshot points must be finite positive screen coordinates",
        "input",
      );
    }

    normalized.push({ x: Math.round(point.x), y: Math.round(point.y) });
  }

  return Object.freeze(normalized);
}

function computeBoundingBox(points: readonly FreeformScreenshotPoint[]): FreeformScreenshotPlan["boundingBox"] {
  const xs = points.map((point) => point.x);
  const ys = points.map((point) => point.y);
  const minX = Math.min(...xs);
  const minY = Math.min(...ys);
  const maxX = Math.max(...xs);
  const maxY = Math.max(...ys);

  return {
    x: minX,
    y: minY,
    width: maxX - minX,
    height: maxY - minY,
  };
}

function resolveScopes(
  requestedScopes: readonly string[] | undefined,
  allowedScopes: readonly string[] | undefined,
): string[] | FreeformScreenshotResult {
  const requested = cleanList(requestedScopes);
  const allowed = cleanList(allowedScopes);

  if (requested.length === 0) {
    return [];
  }

  const denied = requested.filter((scope) => !allowed.includes(scope));
  if (denied.length > 0) {
    return failure("SCOPE_DENIED", `freeformScreenshot scope ${denied[0]} is outside runtime governance`, "scope");
  }

  return requested;
}

export function planFreeformScreenshot(request: FreeformScreenshotRequest = {}): FreeformScreenshotResult {
  const runtimeId = request.context?.runtimeId?.trim();
  if (isBlank(runtimeId)) {
    return failure("MISSING_RUNTIME_ID", "freeformScreenshot requires context.runtimeId for audit", "input");
  }

  if (isBlank(request.purpose)) {
    return failure("MISSING_PURPOSE", "freeformScreenshot requires an explicit purpose", "input");
  }

  if (request.context?.dryRun === false) {
    return failure(
      "REAL_SIDE_EFFECT_NOT_ALLOWED",
      "first-round freeformScreenshot only supports dry-run planning",
      "governance",
    );
  }

  if (request.context?.permission?.accepted !== true) {
    return failure(
      "PERMISSION_REQUIRED",
      request.context?.permission?.reason ?? "freeformScreenshot requires an approved permission gate",
      "permission",
    );
  }

  if (request.context?.contract?.accepted === false) {
    return failure(
      "CONTRACT_REJECTED",
      request.context.contract.reason ?? "freeformScreenshot was rejected by contract surface",
      "contract",
    );
  }

  if (request.context?.governance?.accepted === false) {
    return failure(
      "GOVERNANCE_REJECTED",
      request.context.governance.reason ?? "freeformScreenshot was rejected by runtime governance",
      "governance",
    );
  }

  const points = normalizePoints(request.points);
  if ("ok" in points) {
    return points;
  }

  const displayId = normalizeSafeString(
    request.displayId,
    freeformScreenshotDescriptor.defaultDisplayId,
    "INVALID_DISPLAY_ID",
    "displayId",
  );
  if (typeof displayId !== "string") {
    return displayId;
  }

  const outputFormat = normalizeSafeString(
    request.outputFormat,
    freeformScreenshotDescriptor.defaultOutputFormat,
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
      toolId: "computeruse.freeformScreenshot",
      capability: "capture-freeform-screenshot",
      runtimeId: runtimeId ?? "",
      invocationId: request.context?.invocationId?.trim() || "freeformScreenshot:dry-run",
      displayId,
      purpose: request.purpose?.trim() ?? "",
      outputFormat,
      points,
      boundingBox: computeBoundingBox(points),
      requiredPermissions: ["screen:read", "display:capture", "ui:selection"],
      requiresTapApproval: true,
      dispatch: "dry-run",
      dryRun: true,
      wouldCaptureScreen: true,
      screenshotCaptured: false,
      unsafeSideEffects: false,
      acceptedScopes,
      audit: {
        guard: "freeform-screenshot-permission",
        event: "basicTool.computeruse.freeformScreenshot.planned",
        privacyReviewRequired: true,
        tapCanWrap: true,
        metadata: {
          ...(request.context?.auditMetadata ?? {}),
          ...(request.metadata ?? {}),
        },
      },
    },
    events: ["basicTool.computeruse.freeformScreenshot.planned"],
  };
}
