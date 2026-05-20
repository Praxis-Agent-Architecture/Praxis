/*
 * 文件定位：ToolabilityPool / TAP 高级工具系统 / Office 工具集合 / PDF 工具。
 * 核心目的：提供 办公文档基础工具 / PDF 工具 中的“编辑 PDF”基础能力原语。
 * 能力要求1：需要定义该能力的输入、输出、错误、权限需求和可观测事件。
 * 能力要求2：这些 Office 能力由 TAP 高级工具系统承接，不再作为 baseTool 完成目标。
 * 能力要求3：TAP 负责 Office 能力的治理、审批、组合和专业能力库承接。
 * 边界：承接 Office 高级工具能力，不回写到 agentCore baseTools。
 * 对接：通过 TAP 复用转交与 runtime 官方模块桥接接通，并保留治理、审批和审计边界。
 * 实现提示：先补稳定类型契约、最小可测行为和清晰错误边界，再接入真实执行逻辑。
 */

export type PdfEditBoundary = "input" | "contract" | "governance" | "scope" | "resource";

export type PdfEditPermission = "filesystem:readwrite";

export type PdfEditOperationKind = "annotate" | "merge" | "split" | "rotate" | "redact" | "metadata";

export type PdfEditGate = {
  accepted: boolean;
  reason?: string;
};

export type PdfEditOperation = {
  kind: PdfEditOperationKind;
  targetPage?: number;
  summary: string;
  parameters?: Readonly<Record<string, unknown>>;
};

export type PdfEditTarget = {
  sourcePath: string;
  outputPath: string;
  operations: readonly PdfEditOperation[];
  allowOverwrite?: boolean;
};

export type PdfEditContext = {
  runtimeId?: string;
  invocationId?: string;
  workspaceRoot?: string;
  dryRun?: boolean;
  requestedScopes?: readonly string[];
  allowedScopes?: readonly string[];
  contract?: PdfEditGate;
  governance?: PdfEditGate;
  auditMetadata?: Readonly<Record<string, unknown>>;
};

export type PdfEditRequest = {
  target?: Partial<Omit<PdfEditTarget, "operations">> & {
    operations?: readonly Partial<PdfEditOperation>[];
  };
  context?: PdfEditContext;
};

export type PdfEditEnvelope = {
  outputPath: string;
  operationsApplied: 0;
  artifactAvailable: false;
};

export type PdfEditErrorCode =
  | "MISSING_WORKSPACE_ROOT"
  | "MISSING_SOURCE_PATH"
  | "MISSING_OUTPUT_PATH"
  | "SOURCE_OUT_OF_SCOPE"
  | "OUTPUT_OUT_OF_SCOPE"
  | "MISSING_EDIT_OPERATIONS"
  | "INVALID_EDIT_OPERATION"
  | "INVALID_TARGET_PAGE"
  | "OVERWRITE_NOT_APPROVED"
  | "CONTRACT_REJECTED"
  | "GOVERNANCE_REJECTED"
  | "SCOPE_DENIED"
  | "REAL_EXECUTION_BLOCKED";

export type PdfEditError = {
  code: PdfEditErrorCode;
  message: string;
  boundary: PdfEditBoundary;
  safeForRuntimeInspection: true;
  internalDetailExposed: false;
};

export type PdfEditAuditEvent = {
  type: string;
  toolId: "office.pdfEdit";
  invocationId: string;
  dryRun: true;
  sourcePath?: string;
  outputPath?: string;
  metadata: Readonly<Record<string, unknown>>;
};

export type PdfEditPlan = {
  kind: "agentCore.basicTool.office.pdfEdit";
  toolId: "office.pdfEdit";
  capability: "edit-pdf";
  workspaceRoot: string;
  target: PdfEditTarget;
  operationPreview: readonly string[];
  dryRun: true;
  executionBlocked: true;
  requiredPermissions: readonly PdfEditPermission[];
  requiresTapApproval: true;
  unsafeSideEffects: false;
  acceptedScopes: readonly string[];
  resultEnvelope: PdfEditEnvelope;
};

export type PdfEditResult =
  | {
      ok: true;
      toolId: "office.pdfEdit";
      plan: PdfEditPlan;
      audit: readonly PdfEditAuditEvent[];
      events: readonly string[];
    }
  | {
      ok: false;
      toolId: "office.pdfEdit";
      error: PdfEditError;
      audit: readonly PdfEditAuditEvent[];
      events: readonly string[];
    };

export const pdfEditDescriptor = {
  toolId: "office.pdfEdit",
  capability: "edit-pdf",
  route: "toolabilityPool.officeBase.Portable_Document_Format",
  defaultDryRun: true,
  tapOwnsApproval: true,
  permissionsRequired: ["filesystem:readwrite"],
  unsafeSideEffects: false,
} as const;

const operationKinds = ["annotate", "merge", "split", "rotate", "redact", "metadata"] as const;

function isBlank(value: string | undefined): boolean {
  return typeof value !== "string" || value.trim().length === 0;
}

function invocationId(context: PdfEditContext | undefined): string {
  return context?.invocationId?.trim() || "office.pdfEdit:dry-run";
}

function cleanList(values: readonly string[] | undefined): string[] {
  return [...new Set((values ?? []).map((value) => value.trim()).filter(Boolean))];
}

function auditEvent(
  type: string,
  context: PdfEditContext | undefined,
  sourcePath?: string,
  outputPath?: string,
  metadata?: Readonly<Record<string, unknown>>,
): PdfEditAuditEvent {
  return {
    type,
    toolId: pdfEditDescriptor.toolId,
    invocationId: invocationId(context),
    dryRun: true,
    sourcePath,
    outputPath,
    metadata: {
      ...(context?.auditMetadata ?? {}),
      ...(metadata ?? {}),
    },
  };
}

function failure(
  code: PdfEditErrorCode,
  message: string,
  boundary: PdfEditBoundary,
  context: PdfEditContext | undefined,
  sourcePath?: string,
  outputPath?: string,
): PdfEditResult {
  return {
    ok: false,
    toolId: pdfEditDescriptor.toolId,
    error: {
      code,
      message,
      boundary,
      safeForRuntimeInspection: true,
      internalDetailExposed: false,
    },
    audit: [auditEvent("agentCore.basicTool.office.pdfEdit.rejected", context, sourcePath, outputPath, { code })],
    events: ["basicTool.office.pdfEdit.rejected"],
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

function normalizeOperation(
  operation: Partial<PdfEditOperation>,
  index: number,
  context: PdfEditContext | undefined,
  sourcePath: string,
  outputPath: string,
): PdfEditOperation | PdfEditResult {
  if (!operationKinds.includes(operation.kind as PdfEditOperationKind)) {
    return failure(
      "INVALID_EDIT_OPERATION",
      `office.pdfEdit operation ${index} must declare a supported kind`,
      "input",
      context,
      sourcePath,
      outputPath,
    );
  }

  if (isBlank(operation.summary)) {
    return failure(
      "INVALID_EDIT_OPERATION",
      `office.pdfEdit operation ${index} requires a summary for audit`,
      "input",
      context,
      sourcePath,
      outputPath,
    );
  }

  if (
    operation.targetPage !== undefined &&
    (!Number.isInteger(operation.targetPage) || operation.targetPage <= 0)
  ) {
    return failure(
      "INVALID_TARGET_PAGE",
      `office.pdfEdit operation ${index} targetPage must be a positive integer`,
      "input",
      context,
      sourcePath,
      outputPath,
    );
  }

  return {
    kind: operation.kind as PdfEditOperationKind,
    targetPage: operation.targetPage,
    summary: operation.summary?.trim() ?? "",
    parameters: operation.parameters ?? {},
  };
}

function normalizeOperations(
  operations: readonly Partial<PdfEditOperation>[] | undefined,
  context: PdfEditContext | undefined,
  sourcePath: string,
  outputPath: string,
): readonly PdfEditOperation[] | PdfEditResult {
  if (operations === undefined || operations.length === 0) {
    return failure("MISSING_EDIT_OPERATIONS", "office.pdfEdit requires at least one edit operation", "input", context, sourcePath, outputPath);
  }

  const normalized: PdfEditOperation[] = [];
  for (const [index, operation] of operations.entries()) {
    const normalizedOperation = normalizeOperation(operation, index, context, sourcePath, outputPath);
    if ("ok" in normalizedOperation) {
      return normalizedOperation;
    }
    normalized.push(normalizedOperation);
  }

  return normalized;
}

function resolveScopes(context: PdfEditContext | undefined, sourcePath: string, outputPath: string): string[] | PdfEditResult {
  const requested = cleanList(context?.requestedScopes);
  const allowed = cleanList(context?.allowedScopes);

  if (requested.length === 0) {
    return [];
  }

  const denied = requested.filter((scope) => !allowed.includes(scope));
  if (denied.length > 0) {
    return failure("SCOPE_DENIED", `office.pdfEdit scope ${denied[0]} is outside runtime governance`, "scope", context, sourcePath, outputPath);
  }

  return requested;
}

function normalizeTarget(
  target: PdfEditRequest["target"],
  context: PdfEditContext | undefined,
): PdfEditTarget | PdfEditResult {
  if (isBlank(context?.workspaceRoot)) {
    return failure("MISSING_WORKSPACE_ROOT", "office.pdfEdit requires context.workspaceRoot for scope auditing", "input", context);
  }

  if (isBlank(target?.sourcePath)) {
    return failure("MISSING_SOURCE_PATH", "office.pdfEdit requires target.sourcePath", "input", context);
  }

  if (isBlank(target?.outputPath)) {
    return failure("MISSING_OUTPUT_PATH", "office.pdfEdit requires target.outputPath", "input", context, target?.sourcePath);
  }

  const sourcePath = normalizeRelativePath(target?.sourcePath);
  if (sourcePath === undefined) {
    return failure("SOURCE_OUT_OF_SCOPE", "office.pdfEdit sourcePath must stay inside the declared workspace scope", "scope", context);
  }

  const outputPath = normalizeRelativePath(target?.outputPath);
  if (outputPath === undefined) {
    return failure("OUTPUT_OUT_OF_SCOPE", "office.pdfEdit outputPath must stay inside the declared workspace scope", "scope", context, sourcePath);
  }

  if (sourcePath === outputPath && target?.allowOverwrite !== true) {
    return failure(
      "OVERWRITE_NOT_APPROVED",
      "office.pdfEdit requires allowOverwrite when outputPath equals sourcePath",
      "governance",
      context,
      sourcePath,
      outputPath,
    );
  }

  const operations = normalizeOperations(target?.operations, context, sourcePath, outputPath);
  if ("ok" in operations) {
    return operations;
  }

  return {
    sourcePath,
    outputPath,
    operations,
    allowOverwrite: target?.allowOverwrite === true,
  };
}

function operationPreview(target: PdfEditTarget): readonly string[] {
  return [
    "edit",
    target.sourcePath,
    `output=${target.outputPath}`,
    `operations=${target.operations.length}`,
    ...target.operations.map((operation) => `${operation.kind}:${operation.summary}`),
  ];
}

export function planPdfEdit(request: PdfEditRequest = {}): PdfEditResult {
  const target = normalizeTarget(request.target, request.context);
  if ("ok" in target) {
    return target;
  }

  if (request.context?.dryRun === false) {
    return failure(
      "REAL_EXECUTION_BLOCKED",
      "office.pdfEdit only returns a guarded dry-run plan in the first implementation",
      "contract",
      request.context,
      target.sourcePath,
      target.outputPath,
    );
  }

  if (request.context?.contract?.accepted === false) {
    return failure(
      "CONTRACT_REJECTED",
      request.context.contract.reason ?? "office.pdfEdit was rejected by runtime contract surface",
      "contract",
      request.context,
      target.sourcePath,
      target.outputPath,
    );
  }

  if (request.context?.governance?.accepted === false) {
    return failure(
      "GOVERNANCE_REJECTED",
      request.context.governance.reason ?? "office.pdfEdit was rejected by runtime governance",
      "governance",
      request.context,
      target.sourcePath,
      target.outputPath,
    );
  }

  const acceptedScopes = resolveScopes(request.context, target.sourcePath, target.outputPath);
  if (!Array.isArray(acceptedScopes)) {
    return acceptedScopes;
  }

  return {
    ok: true,
    toolId: pdfEditDescriptor.toolId,
    plan: {
      kind: "agentCore.basicTool.office.pdfEdit",
      toolId: pdfEditDescriptor.toolId,
      capability: pdfEditDescriptor.capability,
      workspaceRoot: request.context?.workspaceRoot?.trim() ?? "",
      target,
      operationPreview: operationPreview(target),
      dryRun: true,
      executionBlocked: true,
      requiredPermissions: pdfEditDescriptor.permissionsRequired,
      requiresTapApproval: true,
      unsafeSideEffects: false,
      acceptedScopes,
      resultEnvelope: {
        outputPath: target.outputPath,
        operationsApplied: 0,
        artifactAvailable: false,
      },
    },
    audit: [
      auditEvent("agentCore.basicTool.office.pdfEdit.dryRun", request.context, target.sourcePath, target.outputPath, {
        operationCount: target.operations.length,
      }),
    ],
    events: ["basicTool.office.pdfEdit.dryRun"],
  };
}
