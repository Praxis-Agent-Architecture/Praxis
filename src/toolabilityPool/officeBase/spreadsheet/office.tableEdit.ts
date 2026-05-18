/*
 * 文件定位：ToolabilityPool / TAP 高级工具系统 / Office 工具集合 / 表格工具。
 * 核心目的：提供 办公文档基础工具 / 表格工具 中的“编辑表格”基础能力原语。
 * 能力要求1：需要定义该能力的输入、输出、错误、权限需求和可观测事件。
 * 能力要求2：这些 Office 能力由 TAP 高级工具系统承接，不再作为 baseTool 完成目标。
 * 能力要求3：TAP 负责 Office 能力的治理、审批、组合和专业能力库承接。
 * 边界：承接 Office 高级工具能力，不回写到 agentCore baseTools。
 * 对接：通过 TAP 复用转交与 runtime 官方模块桥接接通，并保留治理、审批和审计边界。
 * 实现提示：先补稳定类型契约、最小可测行为和清晰错误边界，再接入真实执行逻辑。
 */

export type OfficeTableEditPermission = "filesystem:read" | "filesystem:write" | "office:read" | "office:write";

export type OfficeTableEditErrorBoundary = "input" | "scope" | "permission" | "contract";

export type OfficeTableEditContext = {
  runtimeId?: string;
  invocationId?: string;
  dryRun?: boolean;
  allowedFileRoots?: readonly string[];
  grantedPermissions?: readonly OfficeTableEditPermission[];
  auditMetadata?: Readonly<Record<string, unknown>>;
};

export type OfficeTableCellValue = string | number | boolean | null;

export type OfficeTableEditOperation =
  | {
      kind: "setCell";
      address: string;
      value: OfficeTableCellValue;
      formula?: string;
    }
  | {
      kind: "clearRange";
      range: string;
    };

export type OfficeTableEditOperationInput =
  | {
      kind?: "setCell";
      address?: string;
      value?: OfficeTableCellValue;
      formula?: string;
    }
  | {
      kind?: "clearRange";
      range?: string;
    };

export type OfficeTableEditTarget = {
  workbookPath: string;
  sheetName: string;
  operations: readonly OfficeTableEditOperation[];
};

export type OfficeTableEditRequest = {
  target?: {
    workbookPath?: string;
    sheetName?: string;
    operations?: readonly OfficeTableEditOperationInput[];
  };
  context?: OfficeTableEditContext;
};

export type OfficeTableEditErrorCode =
  | "MISSING_WORKBOOK_PATH"
  | "MISSING_SHEET_NAME"
  | "MISSING_OPERATIONS"
  | "INVALID_OPERATION"
  | "INVALID_CELL_ADDRESS"
  | "INVALID_RANGE"
  | "SCOPE_REJECTED"
  | "PERMISSION_DENIED"
  | "REAL_EXECUTION_BLOCKED";

export type OfficeTableEditError = {
  code: OfficeTableEditErrorCode;
  message: string;
  boundary: OfficeTableEditErrorBoundary;
  publicSafe: true;
};

export type OfficeTableEditAuditEvent = {
  type: string;
  toolId: "office.tableEdit";
  invocationId: string;
  dryRun: boolean;
  targetPath?: string;
  metadata: Readonly<Record<string, unknown>>;
};

export type OfficeTableEditOutput = {
  kind: "agentCore.basicTool.office.tableEdit";
  target: OfficeTableEditTarget;
  dryRun: true;
  executionBlocked: true;
  permissionsRequired: readonly OfficeTableEditPermission[];
  unsafeSideEffects: true;
  writePlan: {
    operationCount: number;
    affectedReferences: readonly string[];
    requiresBackup: true;
  };
};

export type OfficeTableEditResult =
  | {
      ok: true;
      toolId: "office.tableEdit";
      output: OfficeTableEditOutput;
      audit: readonly OfficeTableEditAuditEvent[];
      events: readonly string[];
    }
  | {
      ok: false;
      toolId: "office.tableEdit";
      error: OfficeTableEditError;
      audit: readonly OfficeTableEditAuditEvent[];
      events: readonly string[];
    };

export const officeTableEditDescriptor = {
  toolId: "office.tableEdit",
  capability: "edit-table",
  route: "toolabilityPool.officeBase.spreadsheet",
  defaultDryRun: true,
  tapOwnsApproval: true,
  permissionsRequired: ["filesystem:read", "filesystem:write", "office:read", "office:write"],
  unsafeSideEffects: true,
} as const;

function cleanList<T extends string>(values: readonly T[] | undefined): readonly T[] {
  return [...new Set((values ?? []).map((value) => value.trim()).filter(Boolean) as T[])];
}

function dryRunEnabled(context: OfficeTableEditContext | undefined): boolean {
  return context?.dryRun !== false;
}

function invocationId(context: OfficeTableEditContext | undefined): string {
  return context?.invocationId?.trim() || "office.tableEdit:dry-run";
}

function auditEvent(
  type: string,
  context: OfficeTableEditContext | undefined,
  targetPath?: string,
  metadata?: Readonly<Record<string, unknown>>,
): OfficeTableEditAuditEvent {
  return {
    type,
    toolId: officeTableEditDescriptor.toolId,
    invocationId: invocationId(context),
    dryRun: dryRunEnabled(context),
    targetPath,
    metadata: {
      ...(context?.auditMetadata ?? {}),
      ...(metadata ?? {}),
    },
  };
}

function failure(
  code: OfficeTableEditErrorCode,
  message: string,
  boundary: OfficeTableEditErrorBoundary,
  context: OfficeTableEditContext | undefined,
  targetPath?: string,
): OfficeTableEditResult {
  return {
    ok: false,
    toolId: officeTableEditDescriptor.toolId,
    error: { code, message, boundary, publicSafe: true },
    audit: [auditEvent("agentCore.basicTool.office.tableEdit.rejected", context, targetPath, { code })],
    events: ["basicTool.office.tableEdit.rejected"],
  };
}

function normalizePath(
  workbookPath: string | undefined,
  context: OfficeTableEditContext | undefined,
): string | OfficeTableEditResult {
  const normalized = workbookPath?.trim() ?? "";
  if (normalized.length === 0) {
    return failure("MISSING_WORKBOOK_PATH", "office.tableEdit requires target.workbookPath", "input", context);
  }

  return normalized;
}

function normalizeRoot(root: string): string {
  const trimmed = root.trim();
  return trimmed === "/" ? trimmed : trimmed.replace(/\/+$/, "");
}

function ensureScope(workbookPath: string, context: OfficeTableEditContext | undefined): OfficeTableEditResult | undefined {
  const allowedRoots = cleanList(context?.allowedFileRoots).map(normalizeRoot);
  if (allowedRoots.length === 0) {
    return undefined;
  }

  const allowed = allowedRoots.some((root) => workbookPath === root || workbookPath.startsWith(`${root}/`));
  if (allowed) {
    return undefined;
  }

  return failure(
    "SCOPE_REJECTED",
    "office.tableEdit target workbook is outside the allowed file roots",
    "scope",
    context,
    workbookPath,
  );
}

function ensurePermissions(workbookPath: string, context: OfficeTableEditContext | undefined): OfficeTableEditResult | undefined {
  const granted = cleanList(context?.grantedPermissions);
  if (granted.length === 0) {
    return undefined;
  }

  const missing = officeTableEditDescriptor.permissionsRequired.filter((permission) => !granted.includes(permission));
  if (missing.length === 0) {
    return undefined;
  }

  return failure(
    "PERMISSION_DENIED",
    `office.tableEdit is missing permissions: ${missing.join(", ")}`,
    "permission",
    context,
    workbookPath,
  );
}

function ensureDryRunOnly(workbookPath: string, context: OfficeTableEditContext | undefined): OfficeTableEditResult | undefined {
  if (dryRunEnabled(context)) {
    return undefined;
  }

  return failure(
    "REAL_EXECUTION_BLOCKED",
    "office.tableEdit only returns a guarded dry-run edit plan in the first implementation",
    "contract",
    context,
    workbookPath,
  );
}

function normalizeCellAddress(
  address: string | undefined,
  context: OfficeTableEditContext | undefined,
  workbookPath: string,
): string | OfficeTableEditResult {
  const normalized = address?.trim().toUpperCase() ?? "";
  if (/^[A-Z]{1,3}[1-9]\d*$/.test(normalized)) {
    return normalized;
  }

  return failure("INVALID_CELL_ADDRESS", "office.tableEdit setCell.address must be an A1 cell reference", "input", context, workbookPath);
}

function normalizeRange(
  range: string | undefined,
  context: OfficeTableEditContext | undefined,
  workbookPath: string,
): string | OfficeTableEditResult {
  const normalized = range?.trim().toUpperCase() ?? "";
  if (/^[A-Z]{1,3}[1-9]\d*(?::[A-Z]{1,3}[1-9]\d*)?$/.test(normalized)) {
    return normalized;
  }

  return failure("INVALID_RANGE", "office.tableEdit clearRange.range must be an A1 cell or A1 range", "input", context, workbookPath);
}

function normalizeOperations(
  operations: readonly OfficeTableEditOperationInput[] | undefined,
  context: OfficeTableEditContext | undefined,
  workbookPath: string,
): readonly OfficeTableEditOperation[] | OfficeTableEditResult {
  if (operations === undefined || operations.length === 0) {
    return failure("MISSING_OPERATIONS", "office.tableEdit requires at least one target operation", "input", context, workbookPath);
  }

  const normalized: OfficeTableEditOperation[] = [];
  for (const operation of operations) {
    if (operation.kind === "setCell") {
      const address = normalizeCellAddress(operation.address, context, workbookPath);
      if (typeof address !== "string") {
        return address;
      }

      normalized.push({
        kind: "setCell",
        address,
        value: operation.value ?? null,
        formula: operation.formula?.trim() || undefined,
      });
      continue;
    }

    if (operation.kind === "clearRange") {
      const range = normalizeRange(operation.range, context, workbookPath);
      if (typeof range !== "string") {
        return range;
      }

      normalized.push({ kind: "clearRange", range });
      continue;
    }

    return failure(
      "INVALID_OPERATION",
      "office.tableEdit operations must use kind setCell or clearRange",
      "input",
      context,
      workbookPath,
    );
  }

  return normalized;
}

function normalizeTarget(
  target: OfficeTableEditRequest["target"] | undefined,
  context: OfficeTableEditContext | undefined,
): OfficeTableEditTarget | OfficeTableEditResult {
  const workbookPath = normalizePath(target?.workbookPath, context);
  if (typeof workbookPath !== "string") {
    return workbookPath;
  }

  const sheetName = target?.sheetName?.trim() ?? "";
  if (sheetName.length === 0) {
    return failure("MISSING_SHEET_NAME", "office.tableEdit requires target.sheetName", "input", context, workbookPath);
  }

  const operations = normalizeOperations(target?.operations, context, workbookPath);
  if ("ok" in operations) {
    return operations;
  }

  return {
    workbookPath,
    sheetName,
    operations,
  };
}

function affectedReferences(operations: readonly OfficeTableEditOperation[]): readonly string[] {
  return operations.map((operation) => (operation.kind === "setCell" ? operation.address : operation.range));
}

export function planOfficeTableEdit(request: OfficeTableEditRequest = {}): OfficeTableEditResult {
  const target = normalizeTarget(request.target, request.context);
  if ("ok" in target) {
    return target;
  }

  const scopeFailure = ensureScope(target.workbookPath, request.context);
  if (scopeFailure !== undefined) {
    return scopeFailure;
  }

  const permissionFailure = ensurePermissions(target.workbookPath, request.context);
  if (permissionFailure !== undefined) {
    return permissionFailure;
  }

  const realExecutionFailure = ensureDryRunOnly(target.workbookPath, request.context);
  if (realExecutionFailure !== undefined) {
    return realExecutionFailure;
  }

  return {
    ok: true,
    toolId: officeTableEditDescriptor.toolId,
    output: {
      kind: "agentCore.basicTool.office.tableEdit",
      target,
      dryRun: true,
      executionBlocked: true,
      permissionsRequired: officeTableEditDescriptor.permissionsRequired,
      unsafeSideEffects: true,
      writePlan: {
        operationCount: target.operations.length,
        affectedReferences: affectedReferences(target.operations),
        requiresBackup: true,
      },
    },
    audit: [
      auditEvent("agentCore.basicTool.office.tableEdit.dryRun", request.context, target.workbookPath, {
        sheetName: target.sheetName,
        operationCount: target.operations.length,
      }),
    ],
    events: ["basicTool.office.tableEdit.dryRun"],
  };
}
