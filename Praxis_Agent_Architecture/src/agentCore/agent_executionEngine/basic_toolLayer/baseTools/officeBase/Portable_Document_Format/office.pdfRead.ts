/*
 * 文件定位：Agent 执行引擎 / 基础工具原语层 / 基础工具集合 / 办公文档基础工具 / PDF 工具。
 * 核心目的：提供 办公文档基础工具 / PDF 工具 中的“读取 PDF”基础能力原语。
 * 能力要求1：需要定义该能力的输入、输出、错误、权限需求和可观测事件。
 * 能力要求2：这些基础工具是 Agent 成立的底层能力，不是 TAP 的最终高级工具库。
 * 能力要求3：后续 TAP 可以基于这些原语构建更强的工具编排、审批、替换和专业能力库。
 * 边界：保留 Agent 基础工具原语，不替代 TAP 的高级工具系统。
 * 对接：需要被 runtime.execEngine 拉起，并和 mainLoop、stateEngine、事件暴露、工具调用策略接通。
 * 实现提示：先补稳定类型契约、最小可测行为和清晰错误边界，再接入真实执行逻辑。
 */

export type PdfReadBoundary = "input" | "contract" | "governance" | "scope" | "resource";

export type PdfReadPermission = "filesystem:read";

export type PdfReadView = "text" | "metadata" | "outline" | "page-preview";

export type PdfReadGate = {
  accepted: boolean;
  reason?: string;
};

export type PdfReadPageRange = {
  startPage: number;
  endPage: number;
};

export type PdfReadTarget = {
  sourcePath: string;
  view?: PdfReadView;
  pageRange?: PdfReadPageRange;
  maxPages?: number;
};

export type PdfReadContext = {
  runtimeId?: string;
  invocationId?: string;
  workspaceRoot?: string;
  dryRun?: boolean;
  requestedScopes?: readonly string[];
  allowedScopes?: readonly string[];
  contract?: PdfReadGate;
  governance?: PdfReadGate;
  auditMetadata?: Readonly<Record<string, unknown>>;
};

export type PdfReadRequest = {
  target?: Partial<PdfReadTarget>;
  context?: PdfReadContext;
};

export type PdfReadEnvelope = {
  pages: readonly {
    pageNumber: number;
    text: string;
  }[];
  metadata: Readonly<Record<string, unknown>>;
  outline: readonly string[];
};

export type PdfReadErrorCode =
  | "MISSING_WORKSPACE_ROOT"
  | "MISSING_SOURCE_PATH"
  | "SOURCE_OUT_OF_SCOPE"
  | "INVALID_READ_VIEW"
  | "INVALID_PAGE_RANGE"
  | "INVALID_MAX_PAGES"
  | "CONTRACT_REJECTED"
  | "GOVERNANCE_REJECTED"
  | "SCOPE_DENIED"
  | "REAL_EXECUTION_BLOCKED";

export type PdfReadError = {
  code: PdfReadErrorCode;
  message: string;
  boundary: PdfReadBoundary;
  safeForRuntimeInspection: true;
  internalDetailExposed: false;
};

export type PdfReadAuditEvent = {
  type: string;
  toolId: "office.pdfRead";
  invocationId: string;
  dryRun: true;
  sourcePath?: string;
  metadata: Readonly<Record<string, unknown>>;
};

export type PdfReadPlan = {
  kind: "agentCore.basicTool.office.pdfRead";
  toolId: "office.pdfRead";
  capability: "read-pdf";
  workspaceRoot: string;
  target: PdfReadTarget;
  operationPreview: readonly string[];
  dryRun: true;
  executionBlocked: true;
  requiredPermissions: readonly PdfReadPermission[];
  requiresTapApproval: false;
  unsafeSideEffects: false;
  acceptedScopes: readonly string[];
  resultEnvelope: PdfReadEnvelope;
};

export type PdfReadResult =
  | {
      ok: true;
      toolId: "office.pdfRead";
      plan: PdfReadPlan;
      audit: readonly PdfReadAuditEvent[];
      events: readonly string[];
    }
  | {
      ok: false;
      toolId: "office.pdfRead";
      error: PdfReadError;
      audit: readonly PdfReadAuditEvent[];
      events: readonly string[];
    };

export const pdfReadDescriptor = {
  toolId: "office.pdfRead",
  capability: "read-pdf",
  route: "agent_executionEngine.basic_toolLayer.baseTools.officeBase.Portable_Document_Format",
  defaultDryRun: true,
  tapOwnsApproval: true,
  permissionsRequired: ["filesystem:read"],
  unsafeSideEffects: false,
} as const;

const readViews = ["text", "metadata", "outline", "page-preview"] as const;

function isBlank(value: string | undefined): boolean {
  return typeof value !== "string" || value.trim().length === 0;
}

function invocationId(context: PdfReadContext | undefined): string {
  return context?.invocationId?.trim() || "office.pdfRead:dry-run";
}

function cleanList(values: readonly string[] | undefined): string[] {
  return [...new Set((values ?? []).map((value) => value.trim()).filter(Boolean))];
}

function auditEvent(
  type: string,
  context: PdfReadContext | undefined,
  sourcePath?: string,
  metadata?: Readonly<Record<string, unknown>>,
): PdfReadAuditEvent {
  return {
    type,
    toolId: pdfReadDescriptor.toolId,
    invocationId: invocationId(context),
    dryRun: true,
    sourcePath,
    metadata: {
      ...(context?.auditMetadata ?? {}),
      ...(metadata ?? {}),
    },
  };
}

function failure(
  code: PdfReadErrorCode,
  message: string,
  boundary: PdfReadBoundary,
  context: PdfReadContext | undefined,
  sourcePath?: string,
): PdfReadResult {
  return {
    ok: false,
    toolId: pdfReadDescriptor.toolId,
    error: {
      code,
      message,
      boundary,
      safeForRuntimeInspection: true,
      internalDetailExposed: false,
    },
    audit: [auditEvent("agentCore.basicTool.office.pdfRead.rejected", context, sourcePath, { code })],
    events: ["basicTool.office.pdfRead.rejected"],
  };
}

function normalizeRelativePath(value: string | undefined): string | undefined {
  const normalized = value?.trim().replaceAll("\\", "/").replace(/\/+/g, "/") ?? "";
  const parts = normalized.split("/");

  if (
    normalized.length === 0 ||
    normalized.includes("\0") ||
    normalized.startsWith("/") ||
    parts.some((part) => part === "..")
  ) {
    return undefined;
  }

  return parts.filter((part) => part !== "." && part.length > 0).join("/");
}

function normalizeView(view: string | undefined, context: PdfReadContext | undefined): PdfReadView | PdfReadResult {
  if (view === undefined || view.trim() === "") {
    return "text";
  }

  if (readViews.includes(view as PdfReadView)) {
    return view as PdfReadView;
  }

  return failure("INVALID_READ_VIEW", "office.pdfRead target.view must be text, metadata, outline, or page-preview", "input", context);
}

function validatePageRange(
  pageRange: PdfReadPageRange | undefined,
  context: PdfReadContext | undefined,
  sourcePath: string,
): PdfReadResult | undefined {
  if (pageRange === undefined) {
    return undefined;
  }

  if (
    Number.isInteger(pageRange.startPage) &&
    Number.isInteger(pageRange.endPage) &&
    pageRange.startPage > 0 &&
    pageRange.endPage >= pageRange.startPage
  ) {
    return undefined;
  }

  return failure("INVALID_PAGE_RANGE", "office.pdfRead pageRange must use positive startPage and endPage values", "input", context, sourcePath);
}

function validateMaxPages(
  maxPages: number | undefined,
  context: PdfReadContext | undefined,
  sourcePath: string,
): PdfReadResult | undefined {
  if (maxPages === undefined) {
    return undefined;
  }

  if (Number.isInteger(maxPages) && maxPages > 0) {
    return undefined;
  }

  return failure("INVALID_MAX_PAGES", "office.pdfRead maxPages must be a positive integer", "input", context, sourcePath);
}

function resolveScopes(context: PdfReadContext | undefined, sourcePath: string): string[] | PdfReadResult {
  const requested = cleanList(context?.requestedScopes);
  const allowed = cleanList(context?.allowedScopes);

  if (requested.length === 0) {
    return [];
  }

  const denied = requested.filter((scope) => !allowed.includes(scope));
  if (denied.length > 0) {
    return failure("SCOPE_DENIED", `office.pdfRead scope ${denied[0]} is outside runtime governance`, "scope", context, sourcePath);
  }

  return requested;
}

function normalizeTarget(
  target: Partial<PdfReadTarget> | undefined,
  context: PdfReadContext | undefined,
): PdfReadTarget | PdfReadResult {
  if (isBlank(context?.workspaceRoot)) {
    return failure("MISSING_WORKSPACE_ROOT", "office.pdfRead requires context.workspaceRoot for scope auditing", "input", context);
  }

  if (isBlank(target?.sourcePath)) {
    return failure("MISSING_SOURCE_PATH", "office.pdfRead requires target.sourcePath", "input", context);
  }

  const sourcePath = normalizeRelativePath(target?.sourcePath);
  if (sourcePath === undefined) {
    return failure("SOURCE_OUT_OF_SCOPE", "office.pdfRead sourcePath must stay inside the declared workspace scope", "scope", context);
  }

  const view = normalizeView(target?.view, context);
  if (typeof view !== "string") {
    return view;
  }

  const pageRangeFailure = validatePageRange(target?.pageRange, context, sourcePath);
  if (pageRangeFailure !== undefined) {
    return pageRangeFailure;
  }

  const maxPagesFailure = validateMaxPages(target?.maxPages, context, sourcePath);
  if (maxPagesFailure !== undefined) {
    return maxPagesFailure;
  }

  return {
    sourcePath,
    view,
    pageRange: target?.pageRange,
    maxPages: target?.maxPages,
  };
}

function operationPreview(target: PdfReadTarget): readonly string[] {
  return [
    "read",
    target.sourcePath,
    `view=${target.view ?? "text"}`,
    ...(target.pageRange === undefined ? [] : [`pages=${target.pageRange.startPage}-${target.pageRange.endPage}`]),
    ...(target.maxPages === undefined ? [] : [`max-pages=${target.maxPages}`]),
  ];
}

export function planPdfRead(request: PdfReadRequest = {}): PdfReadResult {
  const target = normalizeTarget(request.target, request.context);
  if ("ok" in target) {
    return target;
  }

  if (request.context?.dryRun === false) {
    return failure(
      "REAL_EXECUTION_BLOCKED",
      "office.pdfRead only returns a guarded dry-run plan in the first implementation",
      "contract",
      request.context,
      target.sourcePath,
    );
  }

  if (request.context?.contract?.accepted === false) {
    return failure(
      "CONTRACT_REJECTED",
      request.context.contract.reason ?? "office.pdfRead was rejected by runtime contract surface",
      "contract",
      request.context,
      target.sourcePath,
    );
  }

  if (request.context?.governance?.accepted === false) {
    return failure(
      "GOVERNANCE_REJECTED",
      request.context.governance.reason ?? "office.pdfRead was rejected by runtime governance",
      "governance",
      request.context,
      target.sourcePath,
    );
  }

  const acceptedScopes = resolveScopes(request.context, target.sourcePath);
  if (!Array.isArray(acceptedScopes)) {
    return acceptedScopes;
  }

  return {
    ok: true,
    toolId: pdfReadDescriptor.toolId,
    plan: {
      kind: "agentCore.basicTool.office.pdfRead",
      toolId: pdfReadDescriptor.toolId,
      capability: pdfReadDescriptor.capability,
      workspaceRoot: request.context?.workspaceRoot?.trim() ?? "",
      target,
      operationPreview: operationPreview(target),
      dryRun: true,
      executionBlocked: true,
      requiredPermissions: pdfReadDescriptor.permissionsRequired,
      requiresTapApproval: false,
      unsafeSideEffects: false,
      acceptedScopes,
      resultEnvelope: {
        pages: [],
        metadata: {},
        outline: [],
      },
    },
    audit: [
      auditEvent("agentCore.basicTool.office.pdfRead.dryRun", request.context, target.sourcePath, {
        view: target.view,
        maxPages: target.maxPages,
      }),
    ],
    events: ["basicTool.office.pdfRead.dryRun"],
  };
}
