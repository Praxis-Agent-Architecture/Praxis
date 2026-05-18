/*
 * 文件定位：ToolabilityPool / TAP 高级工具系统 / Office 工具集合 / 文档工具。
 * 核心目的：提供 办公文档基础工具 / 文档工具 中的“解码文档”基础能力原语。
 * 能力要求1：需要定义该能力的输入、输出、错误、权限需求和可观测事件。
 * 能力要求2：这些 Office 能力由 TAP 高级工具系统承接，不再作为 baseTool 完成目标。
 * 能力要求3：TAP 负责 Office 能力的治理、审批、组合和专业能力库承接。
 * 边界：承接 Office 高级工具能力，不回写到 agentCore baseTools。
 * 对接：通过 TAP 复用转交与 runtime 官方模块桥接接通，并保留治理、审批和审计边界。
 * 实现提示：先补稳定类型契约、最小可测行为和清晰错误边界，再接入真实执行逻辑。
 */

import path from "node:path";

export type DocDecodePermission = "filesystem:read" | "office:document:decode";

export type DocDecodeBoundary = "input" | "scope" | "permission" | "contract";

export type DocDecodeFormat = "docx" | "doc" | "odt" | "rtf" | "txt";

export type DocDecodeContext = {
  runtimeId?: string;
  invocationId?: string;
  dryRun?: boolean;
  allowedDocumentRoots?: readonly string[];
  grantedPermissions?: readonly DocDecodePermission[];
  auditMetadata?: Readonly<Record<string, unknown>>;
};

export type DocDecodeTarget = {
  documentPath: string;
  format?: DocDecodeFormat;
  extractText?: boolean;
  extractMetadata?: boolean;
  extractStructure?: boolean;
  maxCharacters?: number;
};

export type DocDecodeRequest = {
  target?: Partial<DocDecodeTarget>;
  context?: DocDecodeContext;
};

export type DocDecodeErrorCode =
  | "MISSING_DOCUMENT_PATH"
  | "UNSUPPORTED_DOCUMENT_FORMAT"
  | "INVALID_MAX_CHARACTERS"
  | "SCOPE_REJECTED"
  | "PERMISSION_DENIED"
  | "REAL_EXECUTION_BLOCKED";

export type DocDecodeError = {
  code: DocDecodeErrorCode;
  message: string;
  boundary: DocDecodeBoundary;
  publicSafe: true;
};

export type DocDecodeAuditEvent = {
  type: string;
  toolId: "office.docDecode";
  invocationId: string;
  dryRun: boolean;
  documentPath?: string;
  metadata: Readonly<Record<string, unknown>>;
};

export type DocDecodedEnvelope = {
  text?: string;
  metadata: Readonly<Record<string, unknown>>;
  structure: readonly {
    kind: "paragraph" | "heading" | "table" | "image" | "unknown";
    index: number;
    textPreview?: string;
  }[];
  truncated: boolean;
};

export type DocDecodeOutput = {
  kind: "agentCore.basicTool.office.docDecode";
  target: Required<Pick<DocDecodeTarget, "documentPath" | "format" | "extractText" | "extractMetadata" | "extractStructure" | "maxCharacters">>;
  decodePlan: {
    parserHint: "openxml" | "legacy-binary" | "opendocument" | "rich-text" | "plain-text";
    readsFilesystem: true;
    mutatesDocument: false;
  };
  dryRun: true;
  executionBlocked: true;
  permissionsRequired: readonly DocDecodePermission[];
  unsafeSideEffects: false;
  resultEnvelope: DocDecodedEnvelope;
};

export type DocDecodeResult =
  | {
      ok: true;
      toolId: "office.docDecode";
      output: DocDecodeOutput;
      audit: readonly DocDecodeAuditEvent[];
      events: readonly string[];
    }
  | {
      ok: false;
      toolId: "office.docDecode";
      error: DocDecodeError;
      audit: readonly DocDecodeAuditEvent[];
      events: readonly string[];
    };

export const docDecodeDescriptor = {
  toolId: "office.docDecode",
  capability: "decode-document",
  route: "toolabilityPool.officeBase.documentations",
  defaultDryRun: true,
  tapOwnsApproval: true,
  permissionsRequired: ["filesystem:read", "office:document:decode"],
  supportedFormats: ["docx", "doc", "odt", "rtf", "txt"],
} as const;

function cleanList<T extends string>(values: readonly T[] | undefined): readonly T[] {
  return [...new Set((values ?? []).map((value) => value.trim()).filter(Boolean) as T[])];
}

function dryRunEnabled(context: DocDecodeContext | undefined): boolean {
  return context?.dryRun !== false;
}

function invocationId(context: DocDecodeContext | undefined): string {
  return context?.invocationId?.trim() || "office.docDecode:dry-run";
}

function auditEvent(
  type: string,
  context: DocDecodeContext | undefined,
  documentPath?: string,
  metadata?: Readonly<Record<string, unknown>>,
): DocDecodeAuditEvent {
  return {
    type,
    toolId: docDecodeDescriptor.toolId,
    invocationId: invocationId(context),
    dryRun: dryRunEnabled(context),
    documentPath,
    metadata: {
      ...(context?.auditMetadata ?? {}),
      ...(metadata ?? {}),
    },
  };
}

function failure(
  code: DocDecodeErrorCode,
  message: string,
  boundary: DocDecodeBoundary,
  context: DocDecodeContext | undefined,
  documentPath?: string,
): DocDecodeResult {
  return {
    ok: false,
    toolId: docDecodeDescriptor.toolId,
    error: { code, message, boundary, publicSafe: true },
    audit: [auditEvent("agentCore.basicTool.office.docDecode.rejected", context, documentPath, { code })],
    events: ["basicTool.office.docDecode.rejected"],
  };
}

function normalizeAllowedRoot(root: string): string {
  const trimmed = path.posix.normalize(root.trim());
  return trimmed === "/" ? trimmed : trimmed.replace(/\/+$/, "");
}

function normalizeDocumentPath(documentPath: string): string {
  return path.posix.normalize(documentPath);
}

function extensionFromPath(documentPath: string): string | undefined {
  const withoutQuery = documentPath.split(/[?#]/, 1)[0] ?? documentPath;
  const extension = withoutQuery.slice(withoutQuery.lastIndexOf(".") + 1).toLowerCase();
  return extension === withoutQuery.toLowerCase() ? undefined : extension;
}

function isSupportedFormat(format: string): format is DocDecodeFormat {
  return (docDecodeDescriptor.supportedFormats as readonly string[]).includes(format);
}

function parserHintFor(format: DocDecodeFormat): DocDecodeOutput["decodePlan"]["parserHint"] {
  switch (format) {
    case "docx":
      return "openxml";
    case "doc":
      return "legacy-binary";
    case "odt":
      return "opendocument";
    case "rtf":
      return "rich-text";
    case "txt":
      return "plain-text";
  }
}

function normalizeTargetPath(
  documentPath: string | undefined,
  context: DocDecodeContext | undefined,
): string | DocDecodeResult {
  const trimmed = documentPath?.trim() ?? "";
  if (trimmed.length === 0) {
    return failure("MISSING_DOCUMENT_PATH", "office.docDecode requires target.documentPath", "input", context, documentPath);
  }

  return normalizeDocumentPath(trimmed);
}

function normalizeFormat(
  format: string | undefined,
  documentPath: string,
  context: DocDecodeContext | undefined,
): DocDecodeFormat | DocDecodeResult {
  const normalized = format?.trim().toLowerCase() || extensionFromPath(documentPath);
  if (normalized === undefined || !isSupportedFormat(normalized)) {
    return failure(
      "UNSUPPORTED_DOCUMENT_FORMAT",
      "office.docDecode requires target.format or a supported document file extension",
      "input",
      context,
      documentPath,
    );
  }

  return normalized;
}

function normalizeMaxCharacters(
  maxCharacters: number | undefined,
  context: DocDecodeContext | undefined,
  documentPath: string,
): number | DocDecodeResult {
  if (maxCharacters === undefined) {
    return 100_000;
  }

  if (!Number.isInteger(maxCharacters) || maxCharacters < 1 || maxCharacters > 1_000_000) {
    return failure(
      "INVALID_MAX_CHARACTERS",
      "office.docDecode target.maxCharacters must be an integer from 1 to 1000000",
      "input",
      context,
      documentPath,
    );
  }

  return maxCharacters;
}

function ensureScope(documentPath: string, context: DocDecodeContext | undefined): DocDecodeResult | undefined {
  const allowedRoots = cleanList(context?.allowedDocumentRoots).map(normalizeAllowedRoot);
  if (allowedRoots.length === 0) {
    return undefined;
  }

  const allowed = allowedRoots.some((root) => documentPath === root || documentPath.startsWith(`${root}/`));
  if (allowed) {
    return undefined;
  }

  return failure("SCOPE_REJECTED", "office.docDecode target document is outside the allowed document roots", "scope", context, documentPath);
}

function ensurePermissions(documentPath: string, context: DocDecodeContext | undefined): DocDecodeResult | undefined {
  const granted = cleanList(context?.grantedPermissions);
  if (granted.length === 0) {
    return undefined;
  }

  const missing = docDecodeDescriptor.permissionsRequired.filter((permission) => !granted.includes(permission));
  if (missing.length === 0) {
    return undefined;
  }

  return failure("PERMISSION_DENIED", `office.docDecode is missing permissions: ${missing.join(", ")}`, "permission", context, documentPath);
}

function ensureDryRunOnly(documentPath: string, context: DocDecodeContext | undefined): DocDecodeResult | undefined {
  if (dryRunEnabled(context)) {
    return undefined;
  }

  return failure(
    "REAL_EXECUTION_BLOCKED",
    "office.docDecode only returns a guarded dry-run plan in the first implementation",
    "contract",
    context,
    documentPath,
  );
}

function normalizeTarget(
  target: Partial<DocDecodeTarget> | undefined,
  context: DocDecodeContext | undefined,
): DocDecodeOutput["target"] | DocDecodeResult {
  const documentPath = normalizeTargetPath(target?.documentPath, context);
  if (typeof documentPath !== "string") {
    return documentPath;
  }

  const format = normalizeFormat(target?.format, documentPath, context);
  if (typeof format !== "string") {
    return format;
  }

  const maxCharacters = normalizeMaxCharacters(target?.maxCharacters, context, documentPath);
  if (typeof maxCharacters !== "number") {
    return maxCharacters;
  }

  return {
    documentPath,
    format,
    extractText: target?.extractText !== false,
    extractMetadata: target?.extractMetadata !== false,
    extractStructure: target?.extractStructure === true,
    maxCharacters,
  };
}

export function planDocDecode(request: DocDecodeRequest = {}): DocDecodeResult {
  const target = normalizeTarget(request.target, request.context);
  if ("ok" in target) {
    return target;
  }

  const scopeFailure = ensureScope(target.documentPath, request.context);
  if (scopeFailure !== undefined) {
    return scopeFailure;
  }

  const permissionFailure = ensurePermissions(target.documentPath, request.context);
  if (permissionFailure !== undefined) {
    return permissionFailure;
  }

  const realExecutionFailure = ensureDryRunOnly(target.documentPath, request.context);
  if (realExecutionFailure !== undefined) {
    return realExecutionFailure;
  }

  return {
    ok: true,
    toolId: docDecodeDescriptor.toolId,
    output: {
      kind: "agentCore.basicTool.office.docDecode",
      target,
      decodePlan: {
        parserHint: parserHintFor(target.format),
        readsFilesystem: true,
        mutatesDocument: false,
      },
      dryRun: true,
      executionBlocked: true,
      permissionsRequired: docDecodeDescriptor.permissionsRequired,
      unsafeSideEffects: false,
      resultEnvelope: {
        metadata: {},
        structure: [],
        truncated: false,
      },
    },
    audit: [
      auditEvent("agentCore.basicTool.office.docDecode.dryRun", request.context, target.documentPath, {
        format: target.format,
        extractText: target.extractText,
        extractMetadata: target.extractMetadata,
        extractStructure: target.extractStructure,
        maxCharacters: target.maxCharacters,
      }),
    ],
    events: ["basicTool.office.docDecode.dryRun"],
  };
}
