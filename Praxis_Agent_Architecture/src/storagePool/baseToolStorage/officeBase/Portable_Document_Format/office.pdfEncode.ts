/*
 * 文件定位：Agent 执行引擎 / 基础工具原语层 / 基础工具集合 / 办公文档基础工具 / PDF 工具。
 * 核心目的：提供 办公文档基础工具 / PDF 工具 中的“编码 PDF”基础能力原语。
 * 能力要求1：需要定义该能力的输入、输出、错误、权限需求和可观测事件。
 * 能力要求2：这些基础工具是 Agent 成立的底层能力，不是 TAP 的最终高级工具库。
 * 能力要求3：后续 TAP 可以基于这些原语构建更强的工具编排、审批、替换和专业能力库。
 * 边界：保留 Agent 基础工具原语，不替代 TAP 的高级工具系统。
 * 对接：需要被 runtime.execEngine 拉起，并和 mainLoop、stateEngine、事件暴露、工具调用策略接通。
 * 实现提示：先补稳定类型契约、最小可测行为和清晰错误边界，再接入真实执行逻辑。
 */

export type PdfEncodeBoundary = "input" | "contract" | "governance" | "scope" | "resource";

export type PdfEncodePermission = "filesystem:readwrite";

export type PdfEncodeSourceFormat = "markdown" | "html" | "images" | "structured-content";

export type PdfEncodeGate = {
  accepted: boolean;
  reason?: string;
};

export type PdfEncodeTarget = {
  outputPath: string;
  sourceFormat: PdfEncodeSourceFormat;
  sourceLabel: string;
  title?: string;
  pageSize?: "a4" | "letter" | "legal" | "runtime-default";
};

export type PdfEncodeContext = {
  runtimeId?: string;
  invocationId?: string;
  workspaceRoot?: string;
  dryRun?: boolean;
  requestedScopes?: readonly string[];
  allowedScopes?: readonly string[];
  contract?: PdfEncodeGate;
  governance?: PdfEncodeGate;
  auditMetadata?: Readonly<Record<string, unknown>>;
};

export type PdfEncodeRequest = {
  target?: Partial<PdfEncodeTarget>;
  context?: PdfEncodeContext;
};

export type PdfEncodeEnvelope = {
  outputPath: string;
  bytesWritten: 0;
  pageCount: 0;
  artifactAvailable: false;
};

export type PdfEncodeErrorCode =
  | "MISSING_WORKSPACE_ROOT"
  | "MISSING_OUTPUT_PATH"
  | "OUTPUT_OUT_OF_SCOPE"
  | "MISSING_SOURCE_FORMAT"
  | "INVALID_SOURCE_FORMAT"
  | "MISSING_SOURCE_LABEL"
  | "INVALID_PAGE_SIZE"
  | "CONTRACT_REJECTED"
  | "GOVERNANCE_REJECTED"
  | "SCOPE_DENIED"
  | "REAL_EXECUTION_BLOCKED";

export type PdfEncodeError = {
  code: PdfEncodeErrorCode;
  message: string;
  boundary: PdfEncodeBoundary;
  safeForRuntimeInspection: true;
  internalDetailExposed: false;
};

export type PdfEncodeAuditEvent = {
  type: string;
  toolId: "office.pdfEncode";
  invocationId: string;
  dryRun: true;
  outputPath?: string;
  metadata: Readonly<Record<string, unknown>>;
};

export type PdfEncodePlan = {
  kind: "agentCore.basicTool.office.pdfEncode";
  toolId: "office.pdfEncode";
  capability: "encode-pdf";
  workspaceRoot: string;
  target: PdfEncodeTarget;
  operationPreview: readonly string[];
  dryRun: true;
  executionBlocked: true;
  requiredPermissions: readonly PdfEncodePermission[];
  requiresTapApproval: true;
  unsafeSideEffects: false;
  acceptedScopes: readonly string[];
  resultEnvelope: PdfEncodeEnvelope;
};

export type PdfEncodeResult =
  | {
      ok: true;
      toolId: "office.pdfEncode";
      plan: PdfEncodePlan;
      audit: readonly PdfEncodeAuditEvent[];
      events: readonly string[];
    }
  | {
      ok: false;
      toolId: "office.pdfEncode";
      error: PdfEncodeError;
      audit: readonly PdfEncodeAuditEvent[];
      events: readonly string[];
    };

export const pdfEncodeDescriptor = {
  toolId: "office.pdfEncode",
  capability: "encode-pdf",
  route: "agent_executionEngine.basic_toolLayer.baseTools.officeBase.Portable_Document_Format",
  defaultDryRun: true,
  tapOwnsApproval: true,
  permissionsRequired: ["filesystem:readwrite"],
  unsafeSideEffects: false,
} as const;

const sourceFormats = ["markdown", "html", "images", "structured-content"] as const;
const pageSizes = ["a4", "letter", "legal", "runtime-default"] as const;

function isBlank(value: string | undefined): boolean {
  return typeof value !== "string" || value.trim().length === 0;
}

function invocationId(context: PdfEncodeContext | undefined): string {
  return context?.invocationId?.trim() || "office.pdfEncode:dry-run";
}

function cleanList(values: readonly string[] | undefined): string[] {
  return [...new Set((values ?? []).map((value) => value.trim()).filter(Boolean))];
}

function auditEvent(
  type: string,
  context: PdfEncodeContext | undefined,
  outputPath?: string,
  metadata?: Readonly<Record<string, unknown>>,
): PdfEncodeAuditEvent {
  return {
    type,
    toolId: pdfEncodeDescriptor.toolId,
    invocationId: invocationId(context),
    dryRun: true,
    outputPath,
    metadata: {
      ...(context?.auditMetadata ?? {}),
      ...(metadata ?? {}),
    },
  };
}

function failure(
  code: PdfEncodeErrorCode,
  message: string,
  boundary: PdfEncodeBoundary,
  context: PdfEncodeContext | undefined,
  outputPath?: string,
): PdfEncodeResult {
  return {
    ok: false,
    toolId: pdfEncodeDescriptor.toolId,
    error: {
      code,
      message,
      boundary,
      safeForRuntimeInspection: true,
      internalDetailExposed: false,
    },
    audit: [auditEvent("agentCore.basicTool.office.pdfEncode.rejected", context, outputPath, { code })],
    events: ["basicTool.office.pdfEncode.rejected"],
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

function normalizeSourceFormat(
  sourceFormat: string | undefined,
  context: PdfEncodeContext | undefined,
  outputPath?: string,
): PdfEncodeSourceFormat | PdfEncodeResult {
  if (isBlank(sourceFormat)) {
    return failure("MISSING_SOURCE_FORMAT", "office.pdfEncode requires target.sourceFormat", "input", context, outputPath);
  }

  if (sourceFormats.includes(sourceFormat as PdfEncodeSourceFormat)) {
    return sourceFormat as PdfEncodeSourceFormat;
  }

  return failure(
    "INVALID_SOURCE_FORMAT",
    "office.pdfEncode sourceFormat must be markdown, html, images, or structured-content",
    "input",
    context,
    outputPath,
  );
}

function normalizePageSize(
  pageSize: string | undefined,
  context: PdfEncodeContext | undefined,
  outputPath: string,
): PdfEncodeTarget["pageSize"] | PdfEncodeResult {
  if (pageSize === undefined || pageSize.trim() === "") {
    return "runtime-default";
  }

  if (pageSizes.includes(pageSize as NonNullable<PdfEncodeTarget["pageSize"]>)) {
    return pageSize as NonNullable<PdfEncodeTarget["pageSize"]>;
  }

  return failure("INVALID_PAGE_SIZE", "office.pdfEncode pageSize must be a4, letter, legal, or runtime-default", "input", context, outputPath);
}

function resolveScopes(context: PdfEncodeContext | undefined, outputPath: string): string[] | PdfEncodeResult {
  const requested = cleanList(context?.requestedScopes);
  const allowed = cleanList(context?.allowedScopes);

  if (requested.length === 0) {
    return [];
  }

  const denied = requested.filter((scope) => !allowed.includes(scope));
  if (denied.length > 0) {
    return failure("SCOPE_DENIED", `office.pdfEncode scope ${denied[0]} is outside runtime governance`, "scope", context, outputPath);
  }

  return requested;
}

function normalizeTarget(
  target: Partial<PdfEncodeTarget> | undefined,
  context: PdfEncodeContext | undefined,
): PdfEncodeTarget | PdfEncodeResult {
  if (isBlank(context?.workspaceRoot)) {
    return failure("MISSING_WORKSPACE_ROOT", "office.pdfEncode requires context.workspaceRoot for scope auditing", "input", context);
  }

  if (isBlank(target?.outputPath)) {
    return failure("MISSING_OUTPUT_PATH", "office.pdfEncode requires target.outputPath", "input", context);
  }

  const outputPath = normalizeRelativePath(target?.outputPath);
  if (outputPath === undefined) {
    return failure("OUTPUT_OUT_OF_SCOPE", "office.pdfEncode outputPath must stay inside the declared workspace scope", "scope", context);
  }

  if (isBlank(target?.sourceLabel)) {
    return failure("MISSING_SOURCE_LABEL", "office.pdfEncode requires target.sourceLabel for audit and provenance", "input", context, outputPath);
  }

  const sourceFormat = normalizeSourceFormat(target?.sourceFormat, context, outputPath);
  if (typeof sourceFormat !== "string") {
    return sourceFormat;
  }

  const pageSize = normalizePageSize(target?.pageSize, context, outputPath);
  if (typeof pageSize === "object") {
    return pageSize;
  }

  return {
    outputPath,
    sourceFormat,
    sourceLabel: target?.sourceLabel?.trim() ?? "",
    title: target?.title?.trim() || undefined,
    pageSize,
  };
}

function operationPreview(target: PdfEncodeTarget): readonly string[] {
  return [
    "encode",
    `from=${target.sourceFormat}`,
    `source=${target.sourceLabel}`,
    `output=${target.outputPath}`,
    `page-size=${target.pageSize ?? "runtime-default"}`,
  ];
}

export function planPdfEncode(request: PdfEncodeRequest = {}): PdfEncodeResult {
  const target = normalizeTarget(request.target, request.context);
  if ("ok" in target) {
    return target;
  }

  if (request.context?.dryRun === false) {
    return failure(
      "REAL_EXECUTION_BLOCKED",
      "office.pdfEncode only returns a guarded dry-run plan in the first implementation",
      "contract",
      request.context,
      target.outputPath,
    );
  }

  if (request.context?.contract?.accepted === false) {
    return failure(
      "CONTRACT_REJECTED",
      request.context.contract.reason ?? "office.pdfEncode was rejected by runtime contract surface",
      "contract",
      request.context,
      target.outputPath,
    );
  }

  if (request.context?.governance?.accepted === false) {
    return failure(
      "GOVERNANCE_REJECTED",
      request.context.governance.reason ?? "office.pdfEncode was rejected by runtime governance",
      "governance",
      request.context,
      target.outputPath,
    );
  }

  const acceptedScopes = resolveScopes(request.context, target.outputPath);
  if (!Array.isArray(acceptedScopes)) {
    return acceptedScopes;
  }

  return {
    ok: true,
    toolId: pdfEncodeDescriptor.toolId,
    plan: {
      kind: "agentCore.basicTool.office.pdfEncode",
      toolId: pdfEncodeDescriptor.toolId,
      capability: pdfEncodeDescriptor.capability,
      workspaceRoot: request.context?.workspaceRoot?.trim() ?? "",
      target,
      operationPreview: operationPreview(target),
      dryRun: true,
      executionBlocked: true,
      requiredPermissions: pdfEncodeDescriptor.permissionsRequired,
      requiresTapApproval: true,
      unsafeSideEffects: false,
      acceptedScopes,
      resultEnvelope: {
        outputPath: target.outputPath,
        bytesWritten: 0,
        pageCount: 0,
        artifactAvailable: false,
      },
    },
    audit: [
      auditEvent("agentCore.basicTool.office.pdfEncode.dryRun", request.context, target.outputPath, {
        sourceFormat: target.sourceFormat,
        sourceLabel: target.sourceLabel,
      }),
    ],
    events: ["basicTool.office.pdfEncode.dryRun"],
  };
}
