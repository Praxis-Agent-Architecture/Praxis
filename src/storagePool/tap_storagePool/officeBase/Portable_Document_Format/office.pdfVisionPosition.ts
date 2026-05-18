/*
 * 文件定位：ToolabilityPool / TAP 高级工具系统 / Office 工具集合 / PDF 工具。
 * 核心目的：提供 办公文档基础工具 / PDF 工具 中的“定位 PDF 视觉区域”基础能力原语。
 * 能力要求1：需要定义该能力的输入、输出、错误、权限需求和可观测事件。
 * 能力要求2：这些 Office 能力由 TAP 高级工具系统承接，不再作为 baseTool 完成目标。
 * 能力要求3：TAP 负责 Office 能力的治理、审批、组合和专业能力库承接。
 * 边界：承接 Office 高级工具能力，不回写到 agentCore baseTools。
 * 对接：通过 TAP 复用转交与 runtime 官方模块桥接接通，并保留治理、审批和审计边界。
 * 实现提示：先补稳定类型契约、最小可测行为和清晰错误边界，再接入真实执行逻辑。
 */

import path from "node:path";

export type PdfVisionPositionPermission = "filesystem:read" | "office:pdf:read" | "office:pdf:render";

export type PdfVisionPositionBoundary = "input" | "scope" | "permission" | "contract";

export type PdfVisionPositionContext = {
  runtimeId?: string;
  invocationId?: string;
  dryRun?: boolean;
  allowedDocumentRoots?: readonly string[];
  grantedPermissions?: readonly PdfVisionPositionPermission[];
  auditMetadata?: Readonly<Record<string, unknown>>;
};

export type PdfVisionPositionTarget = {
  pdfPath: string;
  visualCue: string;
  pageNumber: number;
  coordinateSystem?: "pdf-points" | "rendered-pixels";
  renderDpi?: number;
  maxCandidates?: number;
};

export type PdfVisionPositionRequest = {
  target?: Partial<PdfVisionPositionTarget>;
  context?: PdfVisionPositionContext;
};

export type PdfVisionPositionErrorCode =
  | "MISSING_PDF_PATH"
  | "INVALID_PDF_PATH"
  | "MISSING_VISUAL_CUE"
  | "INVALID_PAGE_NUMBER"
  | "INVALID_COORDINATE_SYSTEM"
  | "INVALID_RENDER_DPI"
  | "INVALID_MAX_CANDIDATES"
  | "SCOPE_REJECTED"
  | "PERMISSION_DENIED"
  | "REAL_EXECUTION_BLOCKED";

export type PdfVisionPositionError = {
  code: PdfVisionPositionErrorCode;
  message: string;
  boundary: PdfVisionPositionBoundary;
  publicSafe: true;
};

export type PdfVisionPositionAuditEvent = {
  type: string;
  toolId: "office.pdfVisionPosition";
  invocationId: string;
  dryRun: boolean;
  pdfPath?: string;
  metadata: Readonly<Record<string, unknown>>;
};

export type PdfVisionRegionEnvelope = {
  pageNumber: number;
  x: number;
  y: number;
  width: number;
  height: number;
  confidence?: number;
  label?: string;
};

export type PdfVisionPositionOutput = {
  kind: "agentCore.basicTool.office.pdfVisionPosition";
  target: PdfVisionPositionTarget;
  renderPlan: {
    pageNumber: number;
    dpi: number;
    coordinateSystem: "pdf-points" | "rendered-pixels";
  };
  dryRun: true;
  executionBlocked: true;
  permissionsRequired: readonly PdfVisionPositionPermission[];
  providerCallRequired: false;
  unsafeSideEffects: false;
  resultEnvelope: {
    candidateRegions: readonly PdfVisionRegionEnvelope[];
  };
};

export type PdfVisionPositionResult =
  | {
      ok: true;
      toolId: "office.pdfVisionPosition";
      output: PdfVisionPositionOutput;
      audit: readonly PdfVisionPositionAuditEvent[];
      events: readonly string[];
    }
  | {
      ok: false;
      toolId: "office.pdfVisionPosition";
      error: PdfVisionPositionError;
      audit: readonly PdfVisionPositionAuditEvent[];
      events: readonly string[];
    };

export const pdfVisionPositionDescriptor = {
  toolId: "office.pdfVisionPosition",
  capability: "position-pdf-visual-region",
  route: "toolabilityPool.officeBase.Portable_Document_Format",
  defaultDryRun: true,
  tapOwnsApproval: true,
  permissionsRequired: ["filesystem:read", "office:pdf:read", "office:pdf:render"],
} as const;

function cleanList<T extends string>(values: readonly T[] | undefined): readonly T[] {
  return [...new Set((values ?? []).map((value) => value.trim()).filter(Boolean) as T[])];
}

function dryRunEnabled(context: PdfVisionPositionContext | undefined): boolean {
  return context?.dryRun !== false;
}

function invocationId(context: PdfVisionPositionContext | undefined): string {
  return context?.invocationId?.trim() || "office.pdfVisionPosition:dry-run";
}

function auditEvent(
  type: string,
  context: PdfVisionPositionContext | undefined,
  pdfPath?: string,
  metadata?: Readonly<Record<string, unknown>>,
): PdfVisionPositionAuditEvent {
  return {
    type,
    toolId: pdfVisionPositionDescriptor.toolId,
    invocationId: invocationId(context),
    dryRun: dryRunEnabled(context),
    pdfPath,
    metadata: {
      ...(context?.auditMetadata ?? {}),
      ...(metadata ?? {}),
    },
  };
}

function failure(
  code: PdfVisionPositionErrorCode,
  message: string,
  boundary: PdfVisionPositionBoundary,
  context: PdfVisionPositionContext | undefined,
  pdfPath?: string,
): PdfVisionPositionResult {
  return {
    ok: false,
    toolId: pdfVisionPositionDescriptor.toolId,
    error: { code, message, boundary, publicSafe: true },
    audit: [auditEvent("agentCore.basicTool.office.pdfVisionPosition.rejected", context, pdfPath, { code })],
    events: ["basicTool.office.pdfVisionPosition.rejected"],
  };
}

function normalizeAllowedRoot(root: string): string {
  const trimmed = path.posix.normalize(root.trim());
  return trimmed === "/" ? trimmed : trimmed.replace(/\/+$/, "");
}

function normalizeDocumentPath(pdfPath: string): string {
  return path.posix.normalize(pdfPath);
}

function normalizePdfPath(
  pdfPath: string | undefined,
  context: PdfVisionPositionContext | undefined,
): string | PdfVisionPositionResult {
  const trimmed = pdfPath?.trim() ?? "";
  if (trimmed.length === 0) {
    return failure("MISSING_PDF_PATH", "office.pdfVisionPosition requires target.pdfPath", "input", context, pdfPath);
  }

  const normalized = normalizeDocumentPath(trimmed);
  if (!normalized.toLowerCase().endsWith(".pdf")) {
    return failure("INVALID_PDF_PATH", "office.pdfVisionPosition target.pdfPath must point to a PDF file", "input", context, normalized);
  }

  return normalized;
}

function normalizeVisualCue(
  visualCue: string | undefined,
  context: PdfVisionPositionContext | undefined,
  pdfPath: string,
): string | PdfVisionPositionResult {
  const normalized = visualCue?.trim() ?? "";
  if (normalized.length === 0) {
    return failure("MISSING_VISUAL_CUE", "office.pdfVisionPosition requires target.visualCue", "input", context, pdfPath);
  }

  return normalized;
}

function normalizePageNumber(
  pageNumber: number | undefined,
  context: PdfVisionPositionContext | undefined,
  pdfPath: string,
): number | PdfVisionPositionResult {
  if (pageNumber === undefined || !Number.isInteger(pageNumber) || pageNumber < 1) {
    return failure("INVALID_PAGE_NUMBER", "office.pdfVisionPosition target.pageNumber must be a positive integer", "input", context, pdfPath);
  }

  return pageNumber;
}

function normalizeCoordinateSystem(
  coordinateSystem: string | undefined,
  context: PdfVisionPositionContext | undefined,
  pdfPath: string,
): "pdf-points" | "rendered-pixels" | PdfVisionPositionResult {
  if (coordinateSystem === undefined || coordinateSystem.trim() === "") {
    return "pdf-points";
  }

  if (coordinateSystem === "pdf-points" || coordinateSystem === "rendered-pixels") {
    return coordinateSystem;
  }

  return failure(
    "INVALID_COORDINATE_SYSTEM",
    "office.pdfVisionPosition target.coordinateSystem must be pdf-points or rendered-pixels",
    "input",
    context,
    pdfPath,
  );
}

function normalizeRenderDpi(
  renderDpi: number | undefined,
  context: PdfVisionPositionContext | undefined,
  pdfPath: string,
): number | PdfVisionPositionResult {
  if (renderDpi === undefined) {
    return 144;
  }

  if (!Number.isInteger(renderDpi) || renderDpi < 72 || renderDpi > 300) {
    return failure("INVALID_RENDER_DPI", "office.pdfVisionPosition target.renderDpi must be an integer from 72 to 300", "input", context, pdfPath);
  }

  return renderDpi;
}

function normalizeMaxCandidates(
  maxCandidates: number | undefined,
  context: PdfVisionPositionContext | undefined,
  pdfPath: string,
): number | PdfVisionPositionResult {
  if (maxCandidates === undefined) {
    return 10;
  }

  if (!Number.isInteger(maxCandidates) || maxCandidates < 1 || maxCandidates > 100) {
    return failure(
      "INVALID_MAX_CANDIDATES",
      "office.pdfVisionPosition target.maxCandidates must be an integer from 1 to 100",
      "input",
      context,
      pdfPath,
    );
  }

  return maxCandidates;
}

function ensureScope(pdfPath: string, context: PdfVisionPositionContext | undefined): PdfVisionPositionResult | undefined {
  const allowedRoots = cleanList(context?.allowedDocumentRoots).map(normalizeAllowedRoot);
  if (allowedRoots.length === 0) {
    return undefined;
  }

  const allowed = allowedRoots.some((root) => pdfPath === root || pdfPath.startsWith(`${root}/`));
  if (allowed) {
    return undefined;
  }

  return failure("SCOPE_REJECTED", "office.pdfVisionPosition target PDF is outside the allowed document roots", "scope", context, pdfPath);
}

function ensurePermissions(pdfPath: string, context: PdfVisionPositionContext | undefined): PdfVisionPositionResult | undefined {
  const granted = cleanList(context?.grantedPermissions);
  if (granted.length === 0) {
    return undefined;
  }

  const missing = pdfVisionPositionDescriptor.permissionsRequired.filter((permission) => !granted.includes(permission));
  if (missing.length === 0) {
    return undefined;
  }

  return failure("PERMISSION_DENIED", `office.pdfVisionPosition is missing permissions: ${missing.join(", ")}`, "permission", context, pdfPath);
}

function ensureDryRunOnly(pdfPath: string, context: PdfVisionPositionContext | undefined): PdfVisionPositionResult | undefined {
  if (dryRunEnabled(context)) {
    return undefined;
  }

  return failure(
    "REAL_EXECUTION_BLOCKED",
    "office.pdfVisionPosition only returns a guarded dry-run plan in the first implementation",
    "contract",
    context,
    pdfPath,
  );
}

function normalizeTarget(
  target: Partial<PdfVisionPositionTarget> | undefined,
  context: PdfVisionPositionContext | undefined,
): PdfVisionPositionTarget | PdfVisionPositionResult {
  const pdfPath = normalizePdfPath(target?.pdfPath, context);
  if (typeof pdfPath !== "string") {
    return pdfPath;
  }

  const visualCue = normalizeVisualCue(target?.visualCue, context, pdfPath);
  if (typeof visualCue !== "string") {
    return visualCue;
  }

  const pageNumber = normalizePageNumber(target?.pageNumber, context, pdfPath);
  if (typeof pageNumber !== "number") {
    return pageNumber;
  }

  const coordinateSystem = normalizeCoordinateSystem(target?.coordinateSystem, context, pdfPath);
  if (typeof coordinateSystem !== "string") {
    return coordinateSystem;
  }

  const renderDpi = normalizeRenderDpi(target?.renderDpi, context, pdfPath);
  if (typeof renderDpi !== "number") {
    return renderDpi;
  }

  const maxCandidates = normalizeMaxCandidates(target?.maxCandidates, context, pdfPath);
  if (typeof maxCandidates !== "number") {
    return maxCandidates;
  }

  return {
    pdfPath,
    visualCue,
    pageNumber,
    coordinateSystem,
    renderDpi,
    maxCandidates,
  };
}

export function planPdfVisionPosition(request: PdfVisionPositionRequest = {}): PdfVisionPositionResult {
  const target = normalizeTarget(request.target, request.context);
  if ("ok" in target) {
    return target;
  }

  const scopeFailure = ensureScope(target.pdfPath, request.context);
  if (scopeFailure !== undefined) {
    return scopeFailure;
  }

  const permissionFailure = ensurePermissions(target.pdfPath, request.context);
  if (permissionFailure !== undefined) {
    return permissionFailure;
  }

  const realExecutionFailure = ensureDryRunOnly(target.pdfPath, request.context);
  if (realExecutionFailure !== undefined) {
    return realExecutionFailure;
  }

  return {
    ok: true,
    toolId: pdfVisionPositionDescriptor.toolId,
    output: {
      kind: "agentCore.basicTool.office.pdfVisionPosition",
      target,
      renderPlan: {
        pageNumber: target.pageNumber,
        dpi: target.renderDpi ?? 144,
        coordinateSystem: target.coordinateSystem ?? "pdf-points",
      },
      dryRun: true,
      executionBlocked: true,
      permissionsRequired: pdfVisionPositionDescriptor.permissionsRequired,
      providerCallRequired: false,
      unsafeSideEffects: false,
      resultEnvelope: {
        candidateRegions: [],
      },
    },
    audit: [
      auditEvent("agentCore.basicTool.office.pdfVisionPosition.dryRun", request.context, target.pdfPath, {
        pageNumber: target.pageNumber,
        coordinateSystem: target.coordinateSystem,
        renderDpi: target.renderDpi,
        maxCandidates: target.maxCandidates,
      }),
    ],
    events: ["basicTool.office.pdfVisionPosition.dryRun"],
  };
}
