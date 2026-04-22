/*
 * 文件定位：Agent 执行引擎 / 基础工具原语层 / 基础工具集合 / 办公文档基础工具 / 文档工具。
 * 核心目的：提供 办公文档基础工具 / 文档工具 中的“编辑文档”基础能力原语。
 * 能力要求1：需要定义该能力的输入、输出、错误、权限需求和可观测事件。
 * 能力要求2：这些基础工具是 Agent 成立的底层能力，不是 TAP 的最终高级工具库。
 * 能力要求3：后续 TAP 可以基于这些原语构建更强的工具编排、审批、替换和专业能力库。
 * 边界：保留 Agent 基础工具原语，不替代 TAP 的高级工具系统。
 * 对接：需要被 runtime.execEngine 拉起，并和 mainLoop、stateEngine、事件暴露、工具调用策略接通。
 * 实现提示：先补稳定类型契约、最小可测行为和清晰错误边界，再接入真实执行逻辑。
 */

export type OfficeDocEditPermission = "filesystem:read" | "filesystem:write" | "office:document:edit";

export type OfficeDocEditErrorBoundary = "input" | "scope" | "permission" | "contract";

export type OfficeDocEditContext = {
  runtimeId?: string;
  invocationId?: string;
  dryRun?: boolean;
  allowedDocumentRoots?: readonly string[];
  grantedPermissions?: readonly OfficeDocEditPermission[];
  auditMetadata?: Readonly<Record<string, unknown>>;
};

export type OfficeDocEditOperation =
  | {
      kind: "replaceText";
      targetText: string;
      replacementText: string;
      occurrence?: "first" | "all";
    }
  | {
      kind: "insertText";
      locator: string;
      text: string;
      position?: "before" | "after";
    }
  | {
      kind: "deleteRange";
      locator: string;
    };

export type OfficeDocEditTarget = {
  documentPath: string;
  operations: readonly OfficeDocEditOperation[];
  outputPath?: string;
};

export type OfficeDocEditRequest = {
  target?: Partial<Omit<OfficeDocEditTarget, "operations">> & {
    operations?: readonly Partial<OfficeDocEditOperation>[];
  };
  context?: OfficeDocEditContext;
};

export type OfficeDocEditErrorCode =
  | "MISSING_DOCUMENT_PATH"
  | "UNSAFE_DOCUMENT_PATH"
  | "DOCUMENT_PATH_OUTSIDE_SCOPE"
  | "MISSING_EDIT_OPERATIONS"
  | "INVALID_EDIT_OPERATION"
  | "PERMISSION_DENIED"
  | "REAL_EXECUTION_BLOCKED";

export type OfficeDocEditError = {
  code: OfficeDocEditErrorCode;
  message: string;
  boundary: OfficeDocEditErrorBoundary;
  publicSafe: true;
};

export type OfficeDocEditAuditEvent = {
  type: string;
  toolId: "office.docEdit";
  invocationId: string;
  dryRun: boolean;
  documentPath?: string;
  metadata: Readonly<Record<string, unknown>>;
};

export type OfficeDocEditOutput = {
  kind: "agentCore.basicTool.office.docEdit";
  target: OfficeDocEditTarget;
  dryRun: true;
  executionBlocked: true;
  unsafeSideEffects: true;
  permissionsRequired: readonly OfficeDocEditPermission[];
  editPlan: {
    editor: "office-document-editor-v1";
    wouldMutateDocument: true;
    operationCount: number;
    patchEnvelope: {
      appliedOperations: 0;
      conflicts: readonly [];
    };
  };
};

export type OfficeDocEditResult =
  | {
      ok: true;
      toolId: "office.docEdit";
      output: OfficeDocEditOutput;
      audit: readonly OfficeDocEditAuditEvent[];
      events: readonly string[];
    }
  | {
      ok: false;
      toolId: "office.docEdit";
      error: OfficeDocEditError;
      audit: readonly OfficeDocEditAuditEvent[];
      events: readonly string[];
    };

export const officeDocEditDescriptor = {
  toolId: "office.docEdit",
  capability: "edit-document",
  route: "agent_executionEngine.basic_toolLayer.baseTools.officeBase.documentations",
  defaultDryRun: true,
  unsafeSideEffects: true,
  tapOwnsApproval: true,
  permissionsRequired: ["filesystem:read", "filesystem:write", "office:document:edit"],
} as const;

function cleanList<T extends string>(values: readonly T[] | undefined): readonly T[] {
  return [...new Set((values ?? []).map((value) => value.trim()).filter(Boolean) as T[])];
}

function dryRunEnabled(context: OfficeDocEditContext | undefined): boolean {
  return context?.dryRun !== false;
}

function invocationId(context: OfficeDocEditContext | undefined): string {
  return context?.invocationId?.trim() || "office.docEdit:dry-run";
}

function auditEvent(
  type: string,
  context: OfficeDocEditContext | undefined,
  documentPath?: string,
  metadata?: Readonly<Record<string, unknown>>,
): OfficeDocEditAuditEvent {
  return {
    type,
    toolId: officeDocEditDescriptor.toolId,
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
  code: OfficeDocEditErrorCode,
  message: string,
  boundary: OfficeDocEditErrorBoundary,
  context: OfficeDocEditContext | undefined,
  documentPath?: string,
): OfficeDocEditResult {
  return {
    ok: false,
    toolId: officeDocEditDescriptor.toolId,
    error: { code, message, boundary, publicSafe: true },
    audit: [auditEvent("agentCore.basicTool.office.docEdit.rejected", context, documentPath, { code })],
    events: ["basicTool.office.docEdit.rejected"],
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
  context: OfficeDocEditContext | undefined,
): string | OfficeDocEditResult {
  const normalized = documentPath?.trim() ?? "";
  if (normalized.length === 0) {
    return failure("MISSING_DOCUMENT_PATH", "office.docEdit requires target.documentPath", "input", context, documentPath);
  }

  if (hasUnsafePathSegments(normalized)) {
    return failure(
      "UNSAFE_DOCUMENT_PATH",
      "office.docEdit document paths must not contain traversal or NUL segments",
      "scope",
      context,
      normalized,
    );
  }

  return normalized;
}

function normalizeOptionalDocumentPath(
  documentPath: string | undefined,
  context: OfficeDocEditContext | undefined,
): string | undefined | OfficeDocEditResult {
  const normalized = documentPath?.trim() ?? "";
  if (normalized.length === 0) {
    return undefined;
  }

  if (hasUnsafePathSegments(normalized)) {
    return failure(
      "UNSAFE_DOCUMENT_PATH",
      "office.docEdit output paths must not contain traversal or NUL segments",
      "scope",
      context,
      normalized,
    );
  }

  return normalized;
}

function ensureScope(target: OfficeDocEditTarget, context: OfficeDocEditContext | undefined): OfficeDocEditResult | undefined {
  const allowedRoots = cleanList(context?.allowedDocumentRoots).map(normalizeRoot);
  if (allowedRoots.length === 0) {
    return undefined;
  }

  const paths = [target.documentPath, target.outputPath].filter((value): value is string => value !== undefined);
  const outside = paths.find((candidate) => !allowedRoots.some((root) => candidate === root || candidate.startsWith(`${root}/`)));
  if (outside === undefined) {
    return undefined;
  }

  return failure(
    "DOCUMENT_PATH_OUTSIDE_SCOPE",
    "office.docEdit target document is outside the allowed document roots",
    "scope",
    context,
    outside,
  );
}

function ensurePermissions(documentPath: string, context: OfficeDocEditContext | undefined): OfficeDocEditResult | undefined {
  const granted = cleanList(context?.grantedPermissions);
  if (granted.length === 0) {
    return undefined;
  }

  const missing = officeDocEditDescriptor.permissionsRequired.filter((permission) => !granted.includes(permission));
  if (missing.length === 0) {
    return undefined;
  }

  return failure(
    "PERMISSION_DENIED",
    `office.docEdit is missing permissions: ${missing.join(", ")}`,
    "permission",
    context,
    documentPath,
  );
}

function ensureDryRunOnly(documentPath: string, context: OfficeDocEditContext | undefined): OfficeDocEditResult | undefined {
  if (dryRunEnabled(context)) {
    return undefined;
  }

  return failure(
    "REAL_EXECUTION_BLOCKED",
    "office.docEdit only returns a guarded dry-run plan in the first implementation",
    "contract",
    context,
    documentPath,
  );
}

function normalizeReplaceTextOperation(
  operation: Partial<Extract<OfficeDocEditOperation, { kind: "replaceText" }>>,
  context: OfficeDocEditContext | undefined,
  documentPath: string,
): OfficeDocEditOperation | OfficeDocEditResult {
  const targetText = operation.targetText?.trim() ?? "";
  if (targetText.length === 0 || operation.replacementText === undefined) {
    return failure(
      "INVALID_EDIT_OPERATION",
      "office.docEdit replaceText operations require targetText and replacementText",
      "input",
      context,
      documentPath,
    );
  }

  const occurrence = operation.occurrence ?? "first";
  if (occurrence !== "first" && occurrence !== "all") {
    return failure("INVALID_EDIT_OPERATION", "office.docEdit replaceText occurrence must be first or all", "input", context, documentPath);
  }

  return {
    kind: "replaceText",
    targetText,
    replacementText: operation.replacementText,
    occurrence,
  };
}

function normalizeInsertTextOperation(
  operation: Partial<Extract<OfficeDocEditOperation, { kind: "insertText" }>>,
  context: OfficeDocEditContext | undefined,
  documentPath: string,
): OfficeDocEditOperation | OfficeDocEditResult {
  const locator = operation.locator?.trim() ?? "";
  const text = operation.text ?? "";
  if (locator.length === 0 || text.length === 0) {
    return failure("INVALID_EDIT_OPERATION", "office.docEdit insertText operations require locator and text", "input", context, documentPath);
  }

  const position = operation.position ?? "after";
  if (position !== "before" && position !== "after") {
    return failure("INVALID_EDIT_OPERATION", "office.docEdit insertText position must be before or after", "input", context, documentPath);
  }

  return {
    kind: "insertText",
    locator,
    text,
    position,
  };
}

function normalizeDeleteRangeOperation(
  operation: Partial<Extract<OfficeDocEditOperation, { kind: "deleteRange" }>>,
  context: OfficeDocEditContext | undefined,
  documentPath: string,
): OfficeDocEditOperation | OfficeDocEditResult {
  const locator = operation.locator?.trim() ?? "";
  if (locator.length === 0) {
    return failure("INVALID_EDIT_OPERATION", "office.docEdit deleteRange operations require locator", "input", context, documentPath);
  }

  return {
    kind: "deleteRange",
    locator,
  };
}

function normalizeOperations(
  operations: readonly Partial<OfficeDocEditOperation>[] | undefined,
  context: OfficeDocEditContext | undefined,
  documentPath: string,
): readonly OfficeDocEditOperation[] | OfficeDocEditResult {
  if (operations === undefined || operations.length === 0) {
    return failure("MISSING_EDIT_OPERATIONS", "office.docEdit requires at least one target.operations entry", "input", context, documentPath);
  }

  const normalized: OfficeDocEditOperation[] = [];
  for (const operation of operations) {
    if (operation.kind === "replaceText") {
      const next = normalizeReplaceTextOperation(operation, context, documentPath);
      if ("ok" in next) {
        return next;
      }
      normalized.push(next);
      continue;
    }

    if (operation.kind === "insertText") {
      const next = normalizeInsertTextOperation(operation, context, documentPath);
      if ("ok" in next) {
        return next;
      }
      normalized.push(next);
      continue;
    }

    if (operation.kind === "deleteRange") {
      const next = normalizeDeleteRangeOperation(operation, context, documentPath);
      if ("ok" in next) {
        return next;
      }
      normalized.push(next);
      continue;
    }

    return failure(
      "INVALID_EDIT_OPERATION",
      "office.docEdit operations must be replaceText, insertText, or deleteRange",
      "input",
      context,
      documentPath,
    );
  }

  return normalized;
}

function normalizeTarget(
  target: OfficeDocEditRequest["target"],
  context: OfficeDocEditContext | undefined,
): OfficeDocEditTarget | OfficeDocEditResult {
  const documentPath = normalizeDocumentPath(target?.documentPath, context);
  if (typeof documentPath !== "string") {
    return documentPath;
  }

  const outputPath = normalizeOptionalDocumentPath(target?.outputPath, context);
  if (outputPath !== undefined && typeof outputPath !== "string") {
    return outputPath;
  }

  const operations = normalizeOperations(target?.operations, context, documentPath);
  if ("ok" in operations) {
    return operations;
  }

  return {
    documentPath,
    operations,
    outputPath,
  };
}

export function planOfficeDocEdit(request: OfficeDocEditRequest = {}): OfficeDocEditResult {
  const target = normalizeTarget(request.target, request.context);
  if ("ok" in target) {
    return target;
  }

  const scopeFailure = ensureScope(target, request.context);
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
    toolId: officeDocEditDescriptor.toolId,
    output: {
      kind: "agentCore.basicTool.office.docEdit",
      target,
      dryRun: true,
      executionBlocked: true,
      unsafeSideEffects: true,
      permissionsRequired: officeDocEditDescriptor.permissionsRequired,
      editPlan: {
        editor: "office-document-editor-v1",
        wouldMutateDocument: true,
        operationCount: target.operations.length,
        patchEnvelope: {
          appliedOperations: 0,
          conflicts: [],
        },
      },
    },
    audit: [
      auditEvent("agentCore.basicTool.office.docEdit.dryRun", request.context, target.documentPath, {
        operationCount: target.operations.length,
        outputPath: target.outputPath,
      }),
    ],
    events: ["basicTool.office.docEdit.dryRun"],
  };
}
