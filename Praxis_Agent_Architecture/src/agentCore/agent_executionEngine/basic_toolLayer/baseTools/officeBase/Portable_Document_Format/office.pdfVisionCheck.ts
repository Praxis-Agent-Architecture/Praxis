/*
 * 文件定位：Agent 执行引擎 / 基础工具原语层 / 基础工具集合 / 办公文档基础工具 / PDF 工具。
 * 核心目的：提供 办公文档基础工具 / PDF 工具 中的“视觉检查 PDF”基础能力原语。
 * 能力要求1：需要定义该能力的输入、输出、错误、权限需求和可观测事件。
 * 能力要求2：这些基础工具是 Agent 成立的底层能力，不是 TAP 的最终高级工具库。
 * 能力要求3：后续 TAP 可以基于这些原语构建更强的工具编排、审批、替换和专业能力库。
 * 边界：保留 Agent 基础工具原语，不替代 TAP 的高级工具系统。
 * 对接：需要被 runtime.execEngine 拉起，并和 mainLoop、stateEngine、事件暴露、工具调用策略接通。
 * 实现提示：先补稳定类型契约、最小可测行为和清晰错误边界，再接入真实执行逻辑。
 */

import path from "node:path";

export type PdfVisionCheckPermission = "filesystem:read" | "office:pdf:read" | "office:pdf:render";

export type PdfVisionCheckBoundary = "input" | "scope" | "permission" | "contract";

export type PdfVisionCheckContext = {
  runtimeId?: string;
  invocationId?: string;
  dryRun?: boolean;
  allowedDocumentRoots?: readonly string[];
  grantedPermissions?: readonly PdfVisionCheckPermission[];
  auditMetadata?: Readonly<Record<string, unknown>>;
};

export type PdfVisionCheckPageSelection = {
  pages: readonly number[];
};

export type PdfVisionCheckTarget = {
  pdfPath: string;
  checks: readonly string[];
  pageSelection?: PdfVisionCheckPageSelection;
  renderDpi?: number;
  includeThumbnails?: boolean;
};

export type PdfVisionCheckRequest = {
  target?: Partial<PdfVisionCheckTarget>;
  context?: PdfVisionCheckContext;
};

export type PdfVisionCheckErrorCode =
  | "MISSING_PDF_PATH"
  | "INVALID_PDF_PATH"
  | "MISSING_CHECKS"
  | "INVALID_PAGE_SELECTION"
  | "INVALID_RENDER_DPI"
  | "SCOPE_REJECTED"
  | "PERMISSION_DENIED"
  | "REAL_EXECUTION_BLOCKED";

export type PdfVisionCheckError = {
  code: PdfVisionCheckErrorCode;
  message: string;
  boundary: PdfVisionCheckBoundary;
  publicSafe: true;
};

export type PdfVisionCheckAuditEvent = {
  type: string;
  toolId: "office.pdfVisionCheck";
  invocationId: string;
  dryRun: boolean;
  pdfPath?: string;
  metadata: Readonly<Record<string, unknown>>;
};

export type PdfVisionObservationEnvelope = {
  pageNumber: number;
  check: string;
  status: "not-run" | "pass" | "warn" | "fail";
  note?: string;
};

export type PdfVisionCheckOutput = {
  kind: "agentCore.basicTool.office.pdfVisionCheck";
  target: PdfVisionCheckTarget;
  renderPlan: {
    pages: readonly number[] | "all";
    dpi: number;
    includeThumbnails: boolean;
  };
  dryRun: true;
  executionBlocked: true;
  permissionsRequired: readonly PdfVisionCheckPermission[];
  providerCallRequired: false;
  unsafeSideEffects: false;
  resultEnvelope: {
    observations: readonly PdfVisionObservationEnvelope[];
    summary: "not-run";
  };
};

export type PdfVisionCheckResult =
  | {
      ok: true;
      toolId: "office.pdfVisionCheck";
      output: PdfVisionCheckOutput;
      audit: readonly PdfVisionCheckAuditEvent[];
      events: readonly string[];
    }
  | {
      ok: false;
      toolId: "office.pdfVisionCheck";
      error: PdfVisionCheckError;
      audit: readonly PdfVisionCheckAuditEvent[];
      events: readonly string[];
    };

export const pdfVisionCheckDescriptor = {
  toolId: "office.pdfVisionCheck",
  capability: "check-pdf-visual-surface",
  route: "agent_executionEngine.basic_toolLayer.baseTools.officeBase.Portable_Document_Format",
  defaultDryRun: true,
  tapOwnsApproval: true,
  permissionsRequired: ["filesystem:read", "office:pdf:read", "office:pdf:render"],
} as const;

function cleanList<T extends string>(values: readonly T[] | undefined): readonly T[] {
  return [...new Set((values ?? []).map((value) => value.trim()).filter(Boolean) as T[])];
}

function dryRunEnabled(context: PdfVisionCheckContext | undefined): boolean {
  return context?.dryRun !== false;
}

function invocationId(context: PdfVisionCheckContext | undefined): string {
  return context?.invocationId?.trim() || "office.pdfVisionCheck:dry-run";
}

function auditEvent(
  type: string,
  context: PdfVisionCheckContext | undefined,
  pdfPath?: string,
  metadata?: Readonly<Record<string, unknown>>,
): PdfVisionCheckAuditEvent {
  return {
    type,
    toolId: pdfVisionCheckDescriptor.toolId,
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
  code: PdfVisionCheckErrorCode,
  message: string,
  boundary: PdfVisionCheckBoundary,
  context: PdfVisionCheckContext | undefined,
  pdfPath?: string,
): PdfVisionCheckResult {
  return {
    ok: false,
    toolId: pdfVisionCheckDescriptor.toolId,
    error: { code, message, boundary, publicSafe: true },
    audit: [auditEvent("agentCore.basicTool.office.pdfVisionCheck.rejected", context, pdfPath, { code })],
    events: ["basicTool.office.pdfVisionCheck.rejected"],
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
  context: PdfVisionCheckContext | undefined,
): string | PdfVisionCheckResult {
  const trimmed = pdfPath?.trim() ?? "";
  if (trimmed.length === 0) {
    return failure("MISSING_PDF_PATH", "office.pdfVisionCheck requires target.pdfPath", "input", context, pdfPath);
  }

  const normalized = normalizeDocumentPath(trimmed);
  if (!normalized.toLowerCase().endsWith(".pdf")) {
    return failure("INVALID_PDF_PATH", "office.pdfVisionCheck target.pdfPath must point to a PDF file", "input", context, normalized);
  }

  return normalized;
}

function normalizeChecks(
  checks: readonly string[] | undefined,
  context: PdfVisionCheckContext | undefined,
  pdfPath: string,
): readonly string[] | PdfVisionCheckResult {
  const normalized = cleanList(checks);
  if (normalized.length === 0) {
    return failure("MISSING_CHECKS", "office.pdfVisionCheck requires at least one visual check", "input", context, pdfPath);
  }

  return normalized;
}

function normalizePageSelection(
  pageSelection: PdfVisionCheckPageSelection | undefined,
  context: PdfVisionCheckContext | undefined,
  pdfPath: string,
): PdfVisionCheckPageSelection | undefined | PdfVisionCheckResult {
  if (pageSelection === undefined) {
    return undefined;
  }

  const pages = [...new Set(pageSelection.pages)];
  if (pages.length === 0 || pages.some((page) => !Number.isInteger(page) || page < 1)) {
    return failure(
      "INVALID_PAGE_SELECTION",
      "office.pdfVisionCheck target.pageSelection.pages must contain positive page numbers",
      "input",
      context,
      pdfPath,
    );
  }

  return { pages };
}

function normalizeRenderDpi(
  renderDpi: number | undefined,
  context: PdfVisionCheckContext | undefined,
  pdfPath: string,
): number | PdfVisionCheckResult {
  if (renderDpi === undefined) {
    return 144;
  }

  if (!Number.isInteger(renderDpi) || renderDpi < 72 || renderDpi > 300) {
    return failure("INVALID_RENDER_DPI", "office.pdfVisionCheck target.renderDpi must be an integer from 72 to 300", "input", context, pdfPath);
  }

  return renderDpi;
}

function ensureScope(pdfPath: string, context: PdfVisionCheckContext | undefined): PdfVisionCheckResult | undefined {
  const allowedRoots = cleanList(context?.allowedDocumentRoots).map(normalizeAllowedRoot);
  if (allowedRoots.length === 0) {
    return undefined;
  }

  const allowed = allowedRoots.some((root) => pdfPath === root || pdfPath.startsWith(`${root}/`));
  if (allowed) {
    return undefined;
  }

  return failure("SCOPE_REJECTED", "office.pdfVisionCheck target PDF is outside the allowed document roots", "scope", context, pdfPath);
}

function ensurePermissions(pdfPath: string, context: PdfVisionCheckContext | undefined): PdfVisionCheckResult | undefined {
  const granted = cleanList(context?.grantedPermissions);
  if (granted.length === 0) {
    return undefined;
  }

  const missing = pdfVisionCheckDescriptor.permissionsRequired.filter((permission) => !granted.includes(permission));
  if (missing.length === 0) {
    return undefined;
  }

  return failure("PERMISSION_DENIED", `office.pdfVisionCheck is missing permissions: ${missing.join(", ")}`, "permission", context, pdfPath);
}

function ensureDryRunOnly(pdfPath: string, context: PdfVisionCheckContext | undefined): PdfVisionCheckResult | undefined {
  if (dryRunEnabled(context)) {
    return undefined;
  }

  return failure(
    "REAL_EXECUTION_BLOCKED",
    "office.pdfVisionCheck only returns a guarded dry-run plan in the first implementation",
    "contract",
    context,
    pdfPath,
  );
}

function normalizeTarget(
  target: Partial<PdfVisionCheckTarget> | undefined,
  context: PdfVisionCheckContext | undefined,
): PdfVisionCheckTarget | PdfVisionCheckResult {
  const pdfPath = normalizePdfPath(target?.pdfPath, context);
  if (typeof pdfPath !== "string") {
    return pdfPath;
  }

  const checks = normalizeChecks(target?.checks, context, pdfPath);
  if ("ok" in checks) {
    return checks;
  }

  const pageSelection = normalizePageSelection(target?.pageSelection, context, pdfPath);
  if (pageSelection !== undefined && "ok" in pageSelection) {
    return pageSelection;
  }

  const renderDpi = normalizeRenderDpi(target?.renderDpi, context, pdfPath);
  if (typeof renderDpi !== "number") {
    return renderDpi;
  }

  return {
    pdfPath,
    checks,
    pageSelection,
    renderDpi,
    includeThumbnails: target?.includeThumbnails === true,
  };
}

export function planPdfVisionCheck(request: PdfVisionCheckRequest = {}): PdfVisionCheckResult {
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
    toolId: pdfVisionCheckDescriptor.toolId,
    output: {
      kind: "agentCore.basicTool.office.pdfVisionCheck",
      target,
      renderPlan: {
        pages: target.pageSelection?.pages ?? "all",
        dpi: target.renderDpi ?? 144,
        includeThumbnails: target.includeThumbnails === true,
      },
      dryRun: true,
      executionBlocked: true,
      permissionsRequired: pdfVisionCheckDescriptor.permissionsRequired,
      providerCallRequired: false,
      unsafeSideEffects: false,
      resultEnvelope: {
        observations: [],
        summary: "not-run",
      },
    },
    audit: [
      auditEvent("agentCore.basicTool.office.pdfVisionCheck.dryRun", request.context, target.pdfPath, {
        checks: target.checks,
        pages: target.pageSelection?.pages ?? "all",
        renderDpi: target.renderDpi,
      }),
    ],
    events: ["basicTool.office.pdfVisionCheck.dryRun"],
  };
}
