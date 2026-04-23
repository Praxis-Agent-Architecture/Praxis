/*
 * 文件定位：Agent 执行引擎 / 基础工具原语层 / 基础工具集合 / 办公文档基础工具 / 文档工具。
 * 核心目的：提供 办公文档基础工具 / 文档工具 中的“读取文档”基础能力原语。
 * 能力要求1：需要定义该能力的输入、输出、错误、权限需求和可观测事件。
 * 能力要求2：这些基础工具是 Agent 成立的底层能力，不是 TAP 的最终高级工具库。
 * 能力要求3：后续 TAP 可以基于这些原语构建更强的工具编排、审批、替换和专业能力库。
 * 边界：保留 Agent 基础工具原语，不替代 TAP 的高级工具系统。
 * 对接：需要被 runtime.execEngine 拉起，并和 mainLoop、stateEngine、事件暴露、工具调用策略接通。
 * 实现提示：先补稳定类型契约、最小可测行为和清晰错误边界，再接入真实执行逻辑。
 */

export type OfficeDocReadPermission = "filesystem:read" | "office:document:read";

export type OfficeDocReadErrorBoundary = "input" | "scope" | "permission" | "contract";

export type OfficeDocReadContext = {
  runtimeId?: string;
  invocationId?: string;
  dryRun?: boolean;
  allowedDocumentRoots?: readonly string[];
  grantedPermissions?: readonly OfficeDocReadPermission[];
  auditMetadata?: Readonly<Record<string, unknown>>;
};

export type OfficeDocReadMode = "plainText" | "markdown" | "structure";

export type OfficeDocReadTarget = {
  documentPath: string;
  mode?: OfficeDocReadMode;
  maxBytes?: number;
  includeMetadata?: boolean;
};

export type OfficeDocReadRequest = {
  target?: Partial<OfficeDocReadTarget>;
  context?: OfficeDocReadContext;
};

export type OfficeDocReadErrorCode =
  | "MISSING_DOCUMENT_PATH"
  | "UNSAFE_DOCUMENT_PATH"
  | "DOCUMENT_PATH_OUTSIDE_SCOPE"
  | "INVALID_READ_MODE"
  | "INVALID_MAX_BYTES"
  | "PERMISSION_DENIED"
  | "REAL_EXECUTION_BLOCKED";

export type OfficeDocReadError = {
  code: OfficeDocReadErrorCode;
  message: string;
  boundary: OfficeDocReadErrorBoundary;
  publicSafe: true;
};

export type OfficeDocReadAuditEvent = {
  type: string;
  toolId: "office.docRead";
  invocationId: string;
  dryRun: boolean;
  documentPath?: string;
  metadata: Readonly<Record<string, unknown>>;
};

export type OfficeDocReadOutput = {
  kind: "agentCore.basicTool.office.docRead";
  target: Required<Pick<OfficeDocReadTarget, "documentPath" | "mode" | "maxBytes" | "includeMetadata">>;
  dryRun: true;
  executionBlocked: true;
  unsafeSideEffects: false;
  permissionsRequired: readonly OfficeDocReadPermission[];
  readPlan: {
    parser: "office-document-reader-v1";
    wouldReadBytesAtMost: number;
    contentEnvelope: {
      text: "";
      blocks: readonly [];
      metadata: Readonly<Record<string, never>>;
    };
  };
};

export type OfficeDocReadResult =
  | {
      ok: true;
      toolId: "office.docRead";
      output: OfficeDocReadOutput;
      audit: readonly OfficeDocReadAuditEvent[];
      events: readonly string[];
    }
  | {
      ok: false;
      toolId: "office.docRead";
      error: OfficeDocReadError;
      audit: readonly OfficeDocReadAuditEvent[];
      events: readonly string[];
    };

export const officeDocReadDescriptor = {
  toolId: "office.docRead",
  capability: "read-document",
  route: "agent_executionEngine.basic_toolLayer.baseTools.officeBase.documentations",
  defaultDryRun: true,
  unsafeSideEffects: false,
  tapOwnsApproval: true,
  permissionsRequired: ["filesystem:read", "office:document:read"],
  defaultMaxBytes: 512_000,
} as const;

function cleanList<T extends string>(values: readonly T[] | undefined): readonly T[] {
  return [...new Set((values ?? []).map((value) => value.trim()).filter(Boolean) as T[])];
}

function dryRunEnabled(context: OfficeDocReadContext | undefined): boolean {
  return context?.dryRun !== false;
}

function invocationId(context: OfficeDocReadContext | undefined): string {
  return context?.invocationId?.trim() || "office.docRead:dry-run";
}

function auditEvent(
  type: string,
  context: OfficeDocReadContext | undefined,
  documentPath?: string,
  metadata?: Readonly<Record<string, unknown>>,
): OfficeDocReadAuditEvent {
  return {
    type,
    toolId: officeDocReadDescriptor.toolId,
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
  code: OfficeDocReadErrorCode,
  message: string,
  boundary: OfficeDocReadErrorBoundary,
  context: OfficeDocReadContext | undefined,
  documentPath?: string,
): OfficeDocReadResult {
  return {
    ok: false,
    toolId: officeDocReadDescriptor.toolId,
    error: { code, message, boundary, publicSafe: true },
    audit: [auditEvent("agentCore.basicTool.office.docRead.rejected", context, documentPath, { code })],
    events: ["basicTool.office.docRead.rejected"],
  };
}

function normalizeRoot(root: string): string {
  const trimmed = root.trim();
  return trimmed === "/" ? trimmed : trimmed.replace(/\/+$/, "");
}

function hasUnsafePathSegments(value: string): boolean {
  return value.includes("\0") || value.split("/").some((segment) => segment === "..");
}

function normalizeDocumentPath(
  documentPath: string | undefined,
  context: OfficeDocReadContext | undefined,
): string | OfficeDocReadResult {
  const normalized = documentPath?.trim() ?? "";
  if (normalized.length === 0) {
    return failure("MISSING_DOCUMENT_PATH", "office.docRead requires target.documentPath", "input", context, documentPath);
  }

  if (hasUnsafePathSegments(normalized)) {
    return failure(
      "UNSAFE_DOCUMENT_PATH",
      "office.docRead target.documentPath must not contain traversal or NUL segments",
      "scope",
      context,
      normalized,
    );
  }

  return normalized;
}

function ensureScope(documentPath: string, context: OfficeDocReadContext | undefined): OfficeDocReadResult | undefined {
  const allowedRoots = cleanList(context?.allowedDocumentRoots).map(normalizeRoot);
  if (allowedRoots.length === 0) {
    return undefined;
  }

  const allowed = allowedRoots.some((root) => documentPath === root || documentPath.startsWith(`${root}/`));
  if (allowed) {
    return undefined;
  }

  return failure(
    "DOCUMENT_PATH_OUTSIDE_SCOPE",
    "office.docRead target document is outside the allowed document roots",
    "scope",
    context,
    documentPath,
  );
}

function ensurePermissions(documentPath: string, context: OfficeDocReadContext | undefined): OfficeDocReadResult | undefined {
  const granted = cleanList(context?.grantedPermissions);
  if (granted.length === 0) {
    return undefined;
  }

  const missing = officeDocReadDescriptor.permissionsRequired.filter((permission) => !granted.includes(permission));
  if (missing.length === 0) {
    return undefined;
  }

  return failure(
    "PERMISSION_DENIED",
    `office.docRead is missing permissions: ${missing.join(", ")}`,
    "permission",
    context,
    documentPath,
  );
}

function ensureDryRunOnly(documentPath: string, context: OfficeDocReadContext | undefined): OfficeDocReadResult | undefined {
  if (dryRunEnabled(context)) {
    return undefined;
  }

  return failure(
    "REAL_EXECUTION_BLOCKED",
    "office.docRead only returns a guarded dry-run plan in the first implementation",
    "contract",
    context,
    documentPath,
  );
}

function normalizeMode(
  mode: string | undefined,
  context: OfficeDocReadContext | undefined,
  documentPath: string,
): OfficeDocReadMode | OfficeDocReadResult {
  if (mode === undefined || mode.trim() === "") {
    return "plainText";
  }

  if (mode === "plainText" || mode === "markdown" || mode === "structure") {
    return mode;
  }

  return failure("INVALID_READ_MODE", "office.docRead target.mode must be plainText, markdown, or structure", "input", context, documentPath);
}

function normalizeMaxBytes(
  maxBytes: number | undefined,
  context: OfficeDocReadContext | undefined,
  documentPath: string,
): number | OfficeDocReadResult {
  if (maxBytes === undefined) {
    return officeDocReadDescriptor.defaultMaxBytes;
  }

  if (!Number.isInteger(maxBytes) || maxBytes <= 0 || maxBytes > 20_000_000) {
    return failure(
      "INVALID_MAX_BYTES",
      "office.docRead target.maxBytes must be a positive integer up to 20000000",
      "input",
      context,
      documentPath,
    );
  }

  return maxBytes;
}

function normalizeTarget(
  target: Partial<OfficeDocReadTarget> | undefined,
  context: OfficeDocReadContext | undefined,
): Required<Pick<OfficeDocReadTarget, "documentPath" | "mode" | "maxBytes" | "includeMetadata">> | OfficeDocReadResult {
  const documentPath = normalizeDocumentPath(target?.documentPath, context);
  if (typeof documentPath !== "string") {
    return documentPath;
  }

  const mode = normalizeMode(target?.mode, context, documentPath);
  if (typeof mode !== "string") {
    return mode;
  }

  const maxBytes = normalizeMaxBytes(target?.maxBytes, context, documentPath);
  if (typeof maxBytes !== "number") {
    return maxBytes;
  }

  return {
    documentPath,
    mode,
    maxBytes,
    includeMetadata: target?.includeMetadata !== false,
  };
}

export function planOfficeDocRead(request: OfficeDocReadRequest = {}): OfficeDocReadResult {
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
    toolId: officeDocReadDescriptor.toolId,
    output: {
      kind: "agentCore.basicTool.office.docRead",
      target,
      dryRun: true,
      executionBlocked: true,
      unsafeSideEffects: false,
      permissionsRequired: officeDocReadDescriptor.permissionsRequired,
      readPlan: {
        parser: "office-document-reader-v1",
        wouldReadBytesAtMost: target.maxBytes,
        contentEnvelope: {
          text: "",
          blocks: [],
          metadata: {},
        },
      },
    },
    audit: [
      auditEvent("agentCore.basicTool.office.docRead.dryRun", request.context, target.documentPath, {
        mode: target.mode,
        maxBytes: target.maxBytes,
        includeMetadata: target.includeMetadata,
      }),
    ],
    events: ["basicTool.office.docRead.dryRun"],
  };
}
