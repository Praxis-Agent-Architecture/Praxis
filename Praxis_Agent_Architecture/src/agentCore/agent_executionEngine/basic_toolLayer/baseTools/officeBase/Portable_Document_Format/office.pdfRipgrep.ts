/*
 * 文件定位：Agent 执行引擎 / 基础工具原语层 / 基础工具集合 / 办公文档基础工具 / PDF 工具。
 * 核心目的：提供 办公文档基础工具 / PDF 工具 中的“检索 PDF”基础能力原语。
 * 能力要求1：需要定义该能力的输入、输出、错误、权限需求和可观测事件。
 * 能力要求2：这些基础工具是 Agent 成立的底层能力，不是 TAP 的最终高级工具库。
 * 能力要求3：后续 TAP 可以基于这些原语构建更强的工具编排、审批、替换和专业能力库。
 * 边界：保留 Agent 基础工具原语，不替代 TAP 的高级工具系统。
 * 对接：需要被 runtime.execEngine 拉起，并和 mainLoop、stateEngine、事件暴露、工具调用策略接通。
 * 实现提示：先补稳定类型契约、最小可测行为和清晰错误边界，再接入真实执行逻辑。
 */

import path from "node:path";

export type PdfRipgrepPermission = "filesystem:read" | "office:pdf:read";

export type PdfRipgrepBoundary = "input" | "scope" | "permission" | "contract";

export type PdfRipgrepContext = {
  runtimeId?: string;
  invocationId?: string;
  dryRun?: boolean;
  allowedDocumentRoots?: readonly string[];
  grantedPermissions?: readonly PdfRipgrepPermission[];
  auditMetadata?: Readonly<Record<string, unknown>>;
};

export type PdfRipgrepPageRange = {
  startPage: number;
  endPage?: number;
};

export type PdfRipgrepTarget = {
  pdfPath: string;
  query: string;
  pageRange?: PdfRipgrepPageRange;
  caseSensitive?: boolean;
  maxMatches?: number;
  includeTextContext?: boolean;
};

export type PdfRipgrepRequest = {
  target?: Partial<PdfRipgrepTarget>;
  context?: PdfRipgrepContext;
};

export type PdfRipgrepErrorCode =
  | "MISSING_PDF_PATH"
  | "INVALID_PDF_PATH"
  | "MISSING_QUERY"
  | "INVALID_PAGE_RANGE"
  | "INVALID_MAX_MATCHES"
  | "SCOPE_REJECTED"
  | "PERMISSION_DENIED"
  | "REAL_EXECUTION_BLOCKED";

export type PdfRipgrepError = {
  code: PdfRipgrepErrorCode;
  message: string;
  boundary: PdfRipgrepBoundary;
  publicSafe: true;
};

export type PdfRipgrepAuditEvent = {
  type: string;
  toolId: "office.pdfRipgrep";
  invocationId: string;
  dryRun: boolean;
  pdfPath?: string;
  metadata: Readonly<Record<string, unknown>>;
};

export type PdfRipgrepMatchEnvelope = {
  pageNumber: number;
  text: string;
  before?: string;
  after?: string;
};

export type PdfRipgrepOutput = {
  kind: "agentCore.basicTool.office.pdfRipgrep";
  target: PdfRipgrepTarget;
  commandPreview: readonly string[];
  dryRun: true;
  executionBlocked: true;
  permissionsRequired: readonly PdfRipgrepPermission[];
  unsafeSideEffects: false;
  resultEnvelope: {
    matches: readonly PdfRipgrepMatchEnvelope[];
    truncated: boolean;
  };
};

export type PdfRipgrepResult =
  | {
      ok: true;
      toolId: "office.pdfRipgrep";
      output: PdfRipgrepOutput;
      audit: readonly PdfRipgrepAuditEvent[];
      events: readonly string[];
    }
  | {
      ok: false;
      toolId: "office.pdfRipgrep";
      error: PdfRipgrepError;
      audit: readonly PdfRipgrepAuditEvent[];
      events: readonly string[];
    };

export const pdfRipgrepDescriptor = {
  toolId: "office.pdfRipgrep",
  capability: "ripgrep-pdf-text",
  route: "agent_executionEngine.basic_toolLayer.baseTools.officeBase.Portable_Document_Format",
  defaultDryRun: true,
  tapOwnsApproval: true,
  permissionsRequired: ["filesystem:read", "office:pdf:read"],
} as const;

function cleanList<T extends string>(values: readonly T[] | undefined): readonly T[] {
  return [...new Set((values ?? []).map((value) => value.trim()).filter(Boolean) as T[])];
}

function dryRunEnabled(context: PdfRipgrepContext | undefined): boolean {
  return context?.dryRun !== false;
}

function invocationId(context: PdfRipgrepContext | undefined): string {
  return context?.invocationId?.trim() || "office.pdfRipgrep:dry-run";
}

function auditEvent(
  type: string,
  context: PdfRipgrepContext | undefined,
  pdfPath?: string,
  metadata?: Readonly<Record<string, unknown>>,
): PdfRipgrepAuditEvent {
  return {
    type,
    toolId: pdfRipgrepDescriptor.toolId,
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
  code: PdfRipgrepErrorCode,
  message: string,
  boundary: PdfRipgrepBoundary,
  context: PdfRipgrepContext | undefined,
  pdfPath?: string,
): PdfRipgrepResult {
  return {
    ok: false,
    toolId: pdfRipgrepDescriptor.toolId,
    error: { code, message, boundary, publicSafe: true },
    audit: [auditEvent("agentCore.basicTool.office.pdfRipgrep.rejected", context, pdfPath, { code })],
    events: ["basicTool.office.pdfRipgrep.rejected"],
  };
}

function normalizeAllowedRoot(root: string): string {
  const trimmed = path.posix.normalize(root.trim());
  return trimmed === "/" ? trimmed : trimmed.replace(/\/+$/, "");
}

function normalizeDocumentPath(pdfPath: string): string {
  return path.posix.normalize(pdfPath);
}

function ensurePdfPath(pdfPath: string | undefined, context: PdfRipgrepContext | undefined): string | PdfRipgrepResult {
  const trimmed = pdfPath?.trim() ?? "";
  if (trimmed.length === 0) {
    return failure("MISSING_PDF_PATH", "office.pdfRipgrep requires target.pdfPath", "input", context, pdfPath);
  }

  const normalized = normalizeDocumentPath(trimmed);
  if (!normalized.toLowerCase().endsWith(".pdf")) {
    return failure("INVALID_PDF_PATH", "office.pdfRipgrep target.pdfPath must point to a PDF file", "input", context, normalized);
  }

  return normalized;
}

function ensureQuery(query: string | undefined, context: PdfRipgrepContext | undefined, pdfPath: string): string | PdfRipgrepResult {
  const normalized = query?.trim() ?? "";
  if (normalized.length === 0) {
    return failure("MISSING_QUERY", "office.pdfRipgrep requires target.query", "input", context, pdfPath);
  }

  return normalized;
}

function normalizePageRange(
  pageRange: PdfRipgrepPageRange | undefined,
  context: PdfRipgrepContext | undefined,
  pdfPath: string,
): PdfRipgrepPageRange | undefined | PdfRipgrepResult {
  if (pageRange === undefined) {
    return undefined;
  }

  const startPage = pageRange.startPage;
  const endPage = pageRange.endPage ?? startPage;
  if (!Number.isInteger(startPage) || !Number.isInteger(endPage) || startPage < 1 || endPage < startPage) {
    return failure(
      "INVALID_PAGE_RANGE",
      "office.pdfRipgrep target.pageRange must use positive pages with endPage >= startPage",
      "input",
      context,
      pdfPath,
    );
  }

  return { startPage, endPage };
}

function normalizeMaxMatches(
  maxMatches: number | undefined,
  context: PdfRipgrepContext | undefined,
  pdfPath: string,
): number | PdfRipgrepResult {
  if (maxMatches === undefined) {
    return 50;
  }

  if (!Number.isInteger(maxMatches) || maxMatches < 1 || maxMatches > 1000) {
    return failure("INVALID_MAX_MATCHES", "office.pdfRipgrep target.maxMatches must be an integer from 1 to 1000", "input", context, pdfPath);
  }

  return maxMatches;
}

function ensureScope(pdfPath: string, context: PdfRipgrepContext | undefined): PdfRipgrepResult | undefined {
  const allowedRoots = cleanList(context?.allowedDocumentRoots).map(normalizeAllowedRoot);
  if (allowedRoots.length === 0) {
    return undefined;
  }

  const allowed = allowedRoots.some((root) => pdfPath === root || pdfPath.startsWith(`${root}/`));
  if (allowed) {
    return undefined;
  }

  return failure("SCOPE_REJECTED", "office.pdfRipgrep target PDF is outside the allowed document roots", "scope", context, pdfPath);
}

function ensurePermissions(pdfPath: string, context: PdfRipgrepContext | undefined): PdfRipgrepResult | undefined {
  const granted = cleanList(context?.grantedPermissions);
  if (granted.length === 0) {
    return undefined;
  }

  const missing = pdfRipgrepDescriptor.permissionsRequired.filter((permission) => !granted.includes(permission));
  if (missing.length === 0) {
    return undefined;
  }

  return failure("PERMISSION_DENIED", `office.pdfRipgrep is missing permissions: ${missing.join(", ")}`, "permission", context, pdfPath);
}

function ensureDryRunOnly(pdfPath: string, context: PdfRipgrepContext | undefined): PdfRipgrepResult | undefined {
  if (dryRunEnabled(context)) {
    return undefined;
  }

  return failure(
    "REAL_EXECUTION_BLOCKED",
    "office.pdfRipgrep only returns a guarded dry-run plan in the first implementation",
    "contract",
    context,
    pdfPath,
  );
}

function normalizeTarget(
  target: Partial<PdfRipgrepTarget> | undefined,
  context: PdfRipgrepContext | undefined,
): PdfRipgrepTarget | PdfRipgrepResult {
  const pdfPath = ensurePdfPath(target?.pdfPath, context);
  if (typeof pdfPath !== "string") {
    return pdfPath;
  }

  const query = ensureQuery(target?.query, context, pdfPath);
  if (typeof query !== "string") {
    return query;
  }

  const pageRange = normalizePageRange(target?.pageRange, context, pdfPath);
  if (pageRange !== undefined && "ok" in pageRange) {
    return pageRange;
  }

  const maxMatches = normalizeMaxMatches(target?.maxMatches, context, pdfPath);
  if (typeof maxMatches !== "number") {
    return maxMatches;
  }

  return {
    pdfPath,
    query,
    pageRange,
    caseSensitive: target?.caseSensitive === true,
    maxMatches,
    includeTextContext: target?.includeTextContext === true,
  };
}

function commandPreview(target: PdfRipgrepTarget): readonly string[] {
  return [
    "pdftotext",
    "-layout",
    ...(target.pageRange === undefined ? [] : ["-f", String(target.pageRange.startPage), "-l", String(target.pageRange.endPage ?? target.pageRange.startPage)]),
    target.pdfPath,
    "-",
    "|",
    "rg",
    ...(target.caseSensitive === true ? [] : ["--ignore-case"]),
    "--max-count",
    String(target.maxMatches ?? 50),
    ...(target.includeTextContext === true ? ["--context", "1"] : []),
    target.query,
  ];
}

export function planPdfRipgrep(request: PdfRipgrepRequest = {}): PdfRipgrepResult {
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
    toolId: pdfRipgrepDescriptor.toolId,
    output: {
      kind: "agentCore.basicTool.office.pdfRipgrep",
      target,
      commandPreview: commandPreview(target),
      dryRun: true,
      executionBlocked: true,
      permissionsRequired: pdfRipgrepDescriptor.permissionsRequired,
      unsafeSideEffects: false,
      resultEnvelope: {
        matches: [],
        truncated: false,
      },
    },
    audit: [
      auditEvent("agentCore.basicTool.office.pdfRipgrep.dryRun", request.context, target.pdfPath, {
        pageRange: target.pageRange,
        caseSensitive: target.caseSensitive,
        maxMatches: target.maxMatches,
        includeTextContext: target.includeTextContext,
      }),
    ],
    events: ["basicTool.office.pdfRipgrep.dryRun"],
  };
}
