/*
 * 文件定位：ToolabilityPool / TAP 高级工具系统 / Office 工具集合 / PDF 工具。
 * 核心目的：提供 办公文档基础工具 / PDF 工具 中的“解码 PDF”基础能力原语。
 * 能力要求1：需要定义该能力的输入、输出、错误、权限需求和可观测事件。
 * 能力要求2：这些 Office 能力由 TAP 高级工具系统承接，不再作为 baseTool 完成目标。
 * 能力要求3：TAP 负责 Office 能力的治理、审批、组合和专业能力库承接。
 * 边界：承接 Office 高级工具能力，不回写到 agentCore baseTools。
 * 对接：通过 TAP 复用转交与 runtime 官方模块桥接接通，并保留治理、审批和审计边界。
 * 实现提示：先补稳定类型契约、最小可测行为和清晰错误边界，再接入真实执行逻辑。
 */

export type PdfDecodeBoundary = "input" | "contract" | "governance" | "scope" | "resource";

export type PdfDecodePermission = "filesystem:read";

export type PdfDecodeMode = "text" | "metadata" | "structure" | "attachments";

export type PdfDecodeGate = {
  accepted: boolean;
  reason?: string;
};

export type PdfDecodePageRange = {
  startPage: number;
  endPage: number;
};

export type PdfDecodeTarget = {
  sourcePath: string;
  mode?: PdfDecodeMode;
  pageRange?: PdfDecodePageRange;
  passwordRef?: string;
  includeImages?: boolean;
};

export type PdfDecodeContext = {
  runtimeId?: string;
  invocationId?: string;
  workspaceRoot?: string;
  dryRun?: boolean;
  requestedScopes?: readonly string[];
  allowedScopes?: readonly string[];
  contract?: PdfDecodeGate;
  governance?: PdfDecodeGate;
  auditMetadata?: Readonly<Record<string, unknown>>;
};

export type PdfDecodeRequest = {
  target?: Partial<PdfDecodeTarget>;
  context?: PdfDecodeContext;
};

export type PdfDecodedEnvelope = {
  textChunks: readonly string[];
  metadata: Readonly<Record<string, unknown>>;
  attachments: readonly string[];
  pagesInspected: readonly number[];
};

export type PdfDecodeErrorCode =
  | "MISSING_WORKSPACE_ROOT"
  | "MISSING_SOURCE_PATH"
  | "SOURCE_OUT_OF_SCOPE"
  | "INVALID_DECODE_MODE"
  | "INVALID_PAGE_RANGE"
  | "CONTRACT_REJECTED"
  | "GOVERNANCE_REJECTED"
  | "SCOPE_DENIED"
  | "REAL_EXECUTION_BLOCKED";

export type PdfDecodeError = {
  code: PdfDecodeErrorCode;
  message: string;
  boundary: PdfDecodeBoundary;
  safeForRuntimeInspection: true;
  internalDetailExposed: false;
};

export type PdfDecodeAuditEvent = {
  type: string;
  toolId: "office.pdfDecode";
  invocationId: string;
  dryRun: true;
  sourcePath?: string;
  metadata: Readonly<Record<string, unknown>>;
};

export type PdfDecodePlan = {
  kind: "agentCore.basicTool.office.pdfDecode";
  toolId: "office.pdfDecode";
  capability: "decode-pdf";
  workspaceRoot: string;
  target: PdfDecodeTarget;
  operationPreview: readonly string[];
  dryRun: true;
  executionBlocked: true;
  requiredPermissions: readonly PdfDecodePermission[];
  requiresTapApproval: false;
  unsafeSideEffects: false;
  acceptedScopes: readonly string[];
  resultEnvelope: PdfDecodedEnvelope;
};

export type PdfDecodeResult =
  | {
      ok: true;
      toolId: "office.pdfDecode";
      plan: PdfDecodePlan;
      audit: readonly PdfDecodeAuditEvent[];
      events: readonly string[];
    }
  | {
      ok: false;
      toolId: "office.pdfDecode";
      error: PdfDecodeError;
      audit: readonly PdfDecodeAuditEvent[];
      events: readonly string[];
    };

export const pdfDecodeDescriptor = {
  toolId: "office.pdfDecode",
  capability: "decode-pdf",
  route: "toolabilityPool.officeBase.Portable_Document_Format",
  defaultDryRun: true,
  tapOwnsApproval: true,
  permissionsRequired: ["filesystem:read"],
  unsafeSideEffects: false,
} as const;

const decodeModes = ["text", "metadata", "structure", "attachments"] as const;

function isBlank(value: string | undefined): boolean {
  return typeof value !== "string" || value.trim().length === 0;
}

function invocationId(context: PdfDecodeContext | undefined): string {
  return context?.invocationId?.trim() || "office.pdfDecode:dry-run";
}

function cleanList(values: readonly string[] | undefined): string[] {
  return [...new Set((values ?? []).map((value) => value.trim()).filter(Boolean))];
}

function auditEvent(
  type: string,
  context: PdfDecodeContext | undefined,
  sourcePath?: string,
  metadata?: Readonly<Record<string, unknown>>,
): PdfDecodeAuditEvent {
  return {
    type,
    toolId: pdfDecodeDescriptor.toolId,
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
  code: PdfDecodeErrorCode,
  message: string,
  boundary: PdfDecodeBoundary,
  context: PdfDecodeContext | undefined,
  sourcePath?: string,
): PdfDecodeResult {
  return {
    ok: false,
    toolId: pdfDecodeDescriptor.toolId,
    error: {
      code,
      message,
      boundary,
      safeForRuntimeInspection: true,
      internalDetailExposed: false,
    },
    audit: [auditEvent("agentCore.basicTool.office.pdfDecode.rejected", context, sourcePath, { code })],
    events: ["basicTool.office.pdfDecode.rejected"],
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

function normalizeMode(mode: string | undefined, context: PdfDecodeContext | undefined): PdfDecodeMode | PdfDecodeResult {
  if (mode === undefined || mode.trim() === "") {
    return "text";
  }

  if (decodeModes.includes(mode as PdfDecodeMode)) {
    return mode as PdfDecodeMode;
  }

  return failure("INVALID_DECODE_MODE", "office.pdfDecode target.mode must be text, metadata, structure, or attachments", "input", context);
}

function validatePageRange(
  pageRange: PdfDecodePageRange | undefined,
  context: PdfDecodeContext | undefined,
  sourcePath: string,
): PdfDecodeResult | undefined {
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

  return failure(
    "INVALID_PAGE_RANGE",
    "office.pdfDecode pageRange must use positive startPage and endPage values",
    "input",
    context,
    sourcePath,
  );
}

function resolveScopes(context: PdfDecodeContext | undefined, sourcePath: string): string[] | PdfDecodeResult {
  const requested = cleanList(context?.requestedScopes);
  const allowed = cleanList(context?.allowedScopes);

  if (requested.length === 0) {
    return [];
  }

  const denied = requested.filter((scope) => !allowed.includes(scope));
  if (denied.length > 0) {
    return failure("SCOPE_DENIED", `office.pdfDecode scope ${denied[0]} is outside runtime governance`, "scope", context, sourcePath);
  }

  return requested;
}

function normalizeTarget(
  target: Partial<PdfDecodeTarget> | undefined,
  context: PdfDecodeContext | undefined,
): PdfDecodeTarget | PdfDecodeResult {
  if (isBlank(context?.workspaceRoot)) {
    return failure("MISSING_WORKSPACE_ROOT", "office.pdfDecode requires context.workspaceRoot for scope auditing", "input", context);
  }

  if (isBlank(target?.sourcePath)) {
    return failure("MISSING_SOURCE_PATH", "office.pdfDecode requires target.sourcePath", "input", context);
  }

  const sourcePath = normalizeRelativePath(target?.sourcePath);
  if (sourcePath === undefined) {
    return failure("SOURCE_OUT_OF_SCOPE", "office.pdfDecode sourcePath must stay inside the declared workspace scope", "scope", context);
  }

  const mode = normalizeMode(target?.mode, context);
  if (typeof mode !== "string") {
    return mode;
  }

  const pageRangeFailure = validatePageRange(target?.pageRange, context, sourcePath);
  if (pageRangeFailure !== undefined) {
    return pageRangeFailure;
  }

  return {
    sourcePath,
    mode,
    pageRange: target?.pageRange,
    passwordRef: target?.passwordRef?.trim() || undefined,
    includeImages: target?.includeImages === true,
  };
}

function operationPreview(target: PdfDecodeTarget): readonly string[] {
  return [
    "decode",
    target.sourcePath,
    `mode=${target.mode ?? "text"}`,
    ...(target.pageRange === undefined ? [] : [`pages=${target.pageRange.startPage}-${target.pageRange.endPage}`]),
    ...(target.includeImages === true ? ["include-images"] : []),
  ];
}

export function planPdfDecode(request: PdfDecodeRequest = {}): PdfDecodeResult {
  const target = normalizeTarget(request.target, request.context);
  if ("ok" in target) {
    return target;
  }

  if (request.context?.dryRun === false) {
    return failure(
      "REAL_EXECUTION_BLOCKED",
      "office.pdfDecode only returns a guarded dry-run plan in the first implementation",
      "contract",
      request.context,
      target.sourcePath,
    );
  }

  if (request.context?.contract?.accepted === false) {
    return failure(
      "CONTRACT_REJECTED",
      request.context.contract.reason ?? "office.pdfDecode was rejected by runtime contract surface",
      "contract",
      request.context,
      target.sourcePath,
    );
  }

  if (request.context?.governance?.accepted === false) {
    return failure(
      "GOVERNANCE_REJECTED",
      request.context.governance.reason ?? "office.pdfDecode was rejected by runtime governance",
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
    toolId: pdfDecodeDescriptor.toolId,
    plan: {
      kind: "agentCore.basicTool.office.pdfDecode",
      toolId: pdfDecodeDescriptor.toolId,
      capability: pdfDecodeDescriptor.capability,
      workspaceRoot: request.context?.workspaceRoot?.trim() ?? "",
      target,
      operationPreview: operationPreview(target),
      dryRun: true,
      executionBlocked: true,
      requiredPermissions: pdfDecodeDescriptor.permissionsRequired,
      requiresTapApproval: false,
      unsafeSideEffects: false,
      acceptedScopes,
      resultEnvelope: {
        textChunks: [],
        metadata: {},
        attachments: [],
        pagesInspected: [],
      },
    },
    audit: [
      auditEvent("agentCore.basicTool.office.pdfDecode.dryRun", request.context, target.sourcePath, {
        mode: target.mode,
        includeImages: target.includeImages,
      }),
    ],
    events: ["basicTool.office.pdfDecode.dryRun"],
  };
}
