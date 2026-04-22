/*
 * 文件定位：Agent 执行引擎 / 基础工具原语层 / 基础工具集合 / 办公文档基础工具 / 演示文稿工具。
 * 核心目的：提供 办公文档基础工具 / 演示文稿工具 中的“定位演示文稿视觉区域”基础能力原语。
 * 能力要求1：需要定义该能力的输入、输出、错误、权限需求和可观测事件。
 * 能力要求2：这些基础工具是 Agent 成立的底层能力，不是 TAP 的最终高级工具库。
 * 能力要求3：后续 TAP 可以基于这些原语构建更强的工具编排、审批、替换和专业能力库。
 * 边界：保留 Agent 基础工具原语，不替代 TAP 的高级工具系统。
 * 对接：需要被 runtime.execEngine 拉起，并和 mainLoop、stateEngine、事件暴露、工具调用策略接通。
 * 实现提示：先补稳定类型契约、最小可测行为和清晰错误边界，再接入真实执行逻辑。
 */

export type OfficeSlidesVisionPositionPermission = "filesystem:read" | "office:read" | "vision:read";

export type OfficeSlidesVisionPositionErrorBoundary = "input" | "scope" | "permission" | "contract";

export type OfficeSlidesVisionPositionContext = {
  runtimeId?: string;
  invocationId?: string;
  dryRun?: boolean;
  allowedFileRoots?: readonly string[];
  grantedPermissions?: readonly OfficeSlidesVisionPositionPermission[];
  auditMetadata?: Readonly<Record<string, unknown>>;
};

export type OfficeSlidesVisionCoordinateSpace = "slide-pixels" | "normalized";

export type OfficeSlidesVisionPositionTarget = {
  presentationPath: string;
  slideNumber: number;
  query: string;
  coordinateSpace: OfficeSlidesVisionCoordinateSpace;
  maxCandidates: number;
};

export type OfficeSlidesVisionPositionRequest = {
  target?: Partial<OfficeSlidesVisionPositionTarget>;
  context?: OfficeSlidesVisionPositionContext;
};

export type OfficeSlidesVisionPositionBox = {
  x: number;
  y: number;
  width: number;
  height: number;
  coordinateSpace: OfficeSlidesVisionCoordinateSpace;
};

export type OfficeSlidesVisionPositionCandidate = {
  label: string;
  confidence: number;
  box: OfficeSlidesVisionPositionBox;
};

export type OfficeSlidesVisionPositionEnvelope = {
  presentationPath: string;
  slideNumber: number;
  query: string;
  candidates: readonly OfficeSlidesVisionPositionCandidate[];
  pendingVisionExecution: true;
};

export type OfficeSlidesVisionPositionErrorCode =
  | "MISSING_PRESENTATION_PATH"
  | "INVALID_SLIDE_NUMBER"
  | "MISSING_QUERY"
  | "INVALID_COORDINATE_SPACE"
  | "INVALID_RESOURCE_LIMIT"
  | "SCOPE_REJECTED"
  | "PERMISSION_DENIED"
  | "REAL_EXECUTION_BLOCKED";

export type OfficeSlidesVisionPositionError = {
  code: OfficeSlidesVisionPositionErrorCode;
  message: string;
  boundary: OfficeSlidesVisionPositionErrorBoundary;
  publicSafe: true;
};

export type OfficeSlidesVisionPositionAuditEvent = {
  type: string;
  toolId: "office.slidesVisionPosition";
  invocationId: string;
  dryRun: boolean;
  targetPath?: string;
  metadata: Readonly<Record<string, unknown>>;
};

export type OfficeSlidesVisionPositionOutput = {
  kind: "agentCore.basicTool.office.slidesVisionPosition";
  target: OfficeSlidesVisionPositionTarget;
  dryRun: true;
  executionBlocked: true;
  permissionsRequired: readonly OfficeSlidesVisionPositionPermission[];
  unsafeSideEffects: false;
  resultEnvelope: OfficeSlidesVisionPositionEnvelope;
};

export type OfficeSlidesVisionPositionResult =
  | {
      ok: true;
      toolId: "office.slidesVisionPosition";
      output: OfficeSlidesVisionPositionOutput;
      audit: readonly OfficeSlidesVisionPositionAuditEvent[];
      events: readonly string[];
    }
  | {
      ok: false;
      toolId: "office.slidesVisionPosition";
      error: OfficeSlidesVisionPositionError;
      audit: readonly OfficeSlidesVisionPositionAuditEvent[];
      events: readonly string[];
    };

export const officeSlidesVisionPositionDescriptor = {
  toolId: "office.slidesVisionPosition",
  capability: "position-slide-visual-region",
  route: "agent_executionEngine.basic_toolLayer.baseTools.officeBase.presentations",
  defaultDryRun: true,
  tapOwnsApproval: true,
  permissionsRequired: ["filesystem:read", "office:read", "vision:read"],
  unsafeSideEffects: false,
} as const;

function cleanList<T extends string>(values: readonly T[] | undefined): readonly T[] {
  return [...new Set((values ?? []).map((value) => value.trim()).filter(Boolean) as T[])];
}

function dryRunEnabled(context: OfficeSlidesVisionPositionContext | undefined): boolean {
  return context?.dryRun !== false;
}

function invocationId(context: OfficeSlidesVisionPositionContext | undefined): string {
  return context?.invocationId?.trim() || "office.slidesVisionPosition:dry-run";
}

function auditEvent(
  type: string,
  context: OfficeSlidesVisionPositionContext | undefined,
  targetPath?: string,
  metadata?: Readonly<Record<string, unknown>>,
): OfficeSlidesVisionPositionAuditEvent {
  return {
    type,
    toolId: officeSlidesVisionPositionDescriptor.toolId,
    invocationId: invocationId(context),
    dryRun: dryRunEnabled(context),
    targetPath,
    metadata: {
      ...(context?.auditMetadata ?? {}),
      ...(metadata ?? {}),
    },
  };
}

function failure(
  code: OfficeSlidesVisionPositionErrorCode,
  message: string,
  boundary: OfficeSlidesVisionPositionErrorBoundary,
  context: OfficeSlidesVisionPositionContext | undefined,
  targetPath?: string,
): OfficeSlidesVisionPositionResult {
  return {
    ok: false,
    toolId: officeSlidesVisionPositionDescriptor.toolId,
    error: { code, message, boundary, publicSafe: true },
    audit: [auditEvent("agentCore.basicTool.office.slidesVisionPosition.rejected", context, targetPath, { code })],
    events: ["basicTool.office.slidesVisionPosition.rejected"],
  };
}

function normalizePath(
  presentationPath: string | undefined,
  context: OfficeSlidesVisionPositionContext | undefined,
): string | OfficeSlidesVisionPositionResult {
  const normalized = presentationPath?.trim() ?? "";
  if (normalized.length === 0) {
    return failure(
      "MISSING_PRESENTATION_PATH",
      "office.slidesVisionPosition requires target.presentationPath",
      "input",
      context,
    );
  }

  return normalized;
}

function normalizeRoot(root: string): string {
  const trimmed = root.trim();
  return trimmed === "/" ? trimmed : trimmed.replace(/\/+$/, "");
}

function ensureScope(
  presentationPath: string,
  context: OfficeSlidesVisionPositionContext | undefined,
): OfficeSlidesVisionPositionResult | undefined {
  const allowedRoots = cleanList(context?.allowedFileRoots).map(normalizeRoot);
  if (allowedRoots.length === 0) {
    return undefined;
  }

  const allowed = allowedRoots.some((root) => presentationPath === root || presentationPath.startsWith(`${root}/`));
  if (allowed) {
    return undefined;
  }

  return failure(
    "SCOPE_REJECTED",
    "office.slidesVisionPosition target presentation is outside the allowed file roots",
    "scope",
    context,
    presentationPath,
  );
}

function ensurePermissions(
  presentationPath: string,
  context: OfficeSlidesVisionPositionContext | undefined,
): OfficeSlidesVisionPositionResult | undefined {
  const granted = cleanList(context?.grantedPermissions);
  if (granted.length === 0) {
    return undefined;
  }

  const missing = officeSlidesVisionPositionDescriptor.permissionsRequired.filter((permission) => !granted.includes(permission));
  if (missing.length === 0) {
    return undefined;
  }

  return failure(
    "PERMISSION_DENIED",
    `office.slidesVisionPosition is missing permissions: ${missing.join(", ")}`,
    "permission",
    context,
    presentationPath,
  );
}

function ensureDryRunOnly(
  presentationPath: string,
  context: OfficeSlidesVisionPositionContext | undefined,
): OfficeSlidesVisionPositionResult | undefined {
  if (dryRunEnabled(context)) {
    return undefined;
  }

  return failure(
    "REAL_EXECUTION_BLOCKED",
    "office.slidesVisionPosition only returns a guarded dry-run vision-position plan in the first implementation",
    "contract",
    context,
    presentationPath,
  );
}

function normalizeSlideNumber(
  slideNumber: number | undefined,
  context: OfficeSlidesVisionPositionContext | undefined,
  presentationPath: string,
): number | OfficeSlidesVisionPositionResult {
  if (Number.isInteger(slideNumber) && slideNumber !== undefined && slideNumber > 0) {
    return slideNumber;
  }

  return failure(
    "INVALID_SLIDE_NUMBER",
    "office.slidesVisionPosition target.slideNumber must be a positive integer",
    "input",
    context,
    presentationPath,
  );
}

function normalizeCoordinateSpace(
  coordinateSpace: string | undefined,
  context: OfficeSlidesVisionPositionContext | undefined,
  presentationPath: string,
): OfficeSlidesVisionCoordinateSpace | OfficeSlidesVisionPositionResult {
  if (coordinateSpace === undefined || coordinateSpace === "slide-pixels") {
    return "slide-pixels";
  }

  if (coordinateSpace === "normalized") {
    return "normalized";
  }

  return failure(
    "INVALID_COORDINATE_SPACE",
    "office.slidesVisionPosition target.coordinateSpace must be slide-pixels or normalized",
    "input",
    context,
    presentationPath,
  );
}

function normalizeMaxCandidates(
  maxCandidates: number | undefined,
  context: OfficeSlidesVisionPositionContext | undefined,
  presentationPath: string,
): number | OfficeSlidesVisionPositionResult {
  if (maxCandidates === undefined) {
    return 5;
  }

  if (Number.isInteger(maxCandidates) && maxCandidates > 0 && maxCandidates <= 50) {
    return maxCandidates;
  }

  return failure(
    "INVALID_RESOURCE_LIMIT",
    "office.slidesVisionPosition target.maxCandidates must be between 1 and 50",
    "input",
    context,
    presentationPath,
  );
}

function normalizeTarget(
  target: Partial<OfficeSlidesVisionPositionTarget> | undefined,
  context: OfficeSlidesVisionPositionContext | undefined,
): OfficeSlidesVisionPositionTarget | OfficeSlidesVisionPositionResult {
  const presentationPath = normalizePath(target?.presentationPath, context);
  if (typeof presentationPath !== "string") {
    return presentationPath;
  }

  const slideNumber = normalizeSlideNumber(target?.slideNumber, context, presentationPath);
  if (typeof slideNumber !== "number") {
    return slideNumber;
  }

  const query = target?.query?.trim() ?? "";
  if (query.length === 0) {
    return failure(
      "MISSING_QUERY",
      "office.slidesVisionPosition requires target.query describing the visual region to locate",
      "input",
      context,
      presentationPath,
    );
  }

  const coordinateSpace = normalizeCoordinateSpace(target?.coordinateSpace, context, presentationPath);
  if (typeof coordinateSpace !== "string") {
    return coordinateSpace;
  }

  const maxCandidates = normalizeMaxCandidates(target?.maxCandidates, context, presentationPath);
  if (typeof maxCandidates !== "number") {
    return maxCandidates;
  }

  return {
    presentationPath,
    slideNumber,
    query,
    coordinateSpace,
    maxCandidates,
  };
}

export function planOfficeSlidesVisionPosition(
  request: OfficeSlidesVisionPositionRequest = {},
): OfficeSlidesVisionPositionResult {
  const target = normalizeTarget(request.target, request.context);
  if ("ok" in target) {
    return target;
  }

  const scopeFailure = ensureScope(target.presentationPath, request.context);
  if (scopeFailure !== undefined) {
    return scopeFailure;
  }

  const permissionFailure = ensurePermissions(target.presentationPath, request.context);
  if (permissionFailure !== undefined) {
    return permissionFailure;
  }

  const realExecutionFailure = ensureDryRunOnly(target.presentationPath, request.context);
  if (realExecutionFailure !== undefined) {
    return realExecutionFailure;
  }

  return {
    ok: true,
    toolId: officeSlidesVisionPositionDescriptor.toolId,
    output: {
      kind: "agentCore.basicTool.office.slidesVisionPosition",
      target,
      dryRun: true,
      executionBlocked: true,
      permissionsRequired: officeSlidesVisionPositionDescriptor.permissionsRequired,
      unsafeSideEffects: false,
      resultEnvelope: {
        presentationPath: target.presentationPath,
        slideNumber: target.slideNumber,
        query: target.query,
        candidates: [],
        pendingVisionExecution: true,
      },
    },
    audit: [
      auditEvent("agentCore.basicTool.office.slidesVisionPosition.dryRun", request.context, target.presentationPath, {
        slideNumber: target.slideNumber,
        query: target.query,
        coordinateSpace: target.coordinateSpace,
        maxCandidates: target.maxCandidates,
      }),
    ],
    events: ["basicTool.office.slidesVisionPosition.dryRun"],
  };
}
