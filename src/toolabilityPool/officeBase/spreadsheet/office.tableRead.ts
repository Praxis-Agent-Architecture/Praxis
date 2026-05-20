/*
 * 文件定位：ToolabilityPool / TAP 高级工具系统 / Office 工具集合 / 表格工具。
 * 核心目的：提供 办公文档基础工具 / 表格工具 中的“读取表格”基础能力原语。
 * 能力要求1：需要定义该能力的输入、输出、错误、权限需求和可观测事件。
 * 能力要求2：这些 Office 能力由 TAP 高级工具系统承接，不再作为 baseTool 完成目标。
 * 能力要求3：TAP 负责 Office 能力的治理、审批、组合和专业能力库承接。
 * 边界：承接 Office 高级工具能力，不回写到 agentCore baseTools。
 * 对接：通过 TAP 复用转交与 runtime 官方模块桥接接通，并保留治理、审批和审计边界。
 * 实现提示：先补稳定类型契约、最小可测行为和清晰错误边界，再接入真实执行逻辑。
 */

export type OfficeTableReadPermission = "filesystem:read" | "office:read";

export type OfficeTableReadErrorBoundary = "input" | "scope" | "permission" | "contract";

export type OfficeTableReadContext = {
  runtimeId?: string;
  invocationId?: string;
  dryRun?: boolean;
  allowedFileRoots?: readonly string[];
  grantedPermissions?: readonly OfficeTableReadPermission[];
  auditMetadata?: Readonly<Record<string, unknown>>;
};

export type OfficeTableReadValueMode = "display" | "raw" | "formula";

export type OfficeTableReadTarget = {
  workbookPath: string;
  sheetName?: string;
  range?: string;
  valueMode: OfficeTableReadValueMode;
  includeHeaderRow: boolean;
  maxRows: number;
  maxColumns: number;
};

export type OfficeTableReadRequest = {
  target?: Partial<OfficeTableReadTarget>;
  context?: OfficeTableReadContext;
};

export type OfficeTableReadCellValue = string | number | boolean | null;

export type OfficeTableReadEnvelope = {
  workbookPath: string;
  sheetName?: string;
  range?: string;
  rows: readonly (readonly OfficeTableReadCellValue[])[];
  headerRow?: readonly string[];
  truncated: false;
  metadata: {
    valueMode: OfficeTableReadValueMode;
    includeHeaderRow: boolean;
    maxRows: number;
    maxColumns: number;
  };
};

export type OfficeTableReadErrorCode =
  | "MISSING_WORKBOOK_PATH"
  | "INVALID_RANGE"
  | "INVALID_VALUE_MODE"
  | "INVALID_RESOURCE_LIMIT"
  | "SCOPE_REJECTED"
  | "PERMISSION_DENIED"
  | "REAL_EXECUTION_BLOCKED";

export type OfficeTableReadError = {
  code: OfficeTableReadErrorCode;
  message: string;
  boundary: OfficeTableReadErrorBoundary;
  publicSafe: true;
};

export type OfficeTableReadAuditEvent = {
  type: string;
  toolId: "office.tableRead";
  invocationId: string;
  dryRun: boolean;
  targetPath?: string;
  metadata: Readonly<Record<string, unknown>>;
};

export type OfficeTableReadOutput = {
  kind: "agentCore.basicTool.office.tableRead";
  target: OfficeTableReadTarget;
  dryRun: true;
  executionBlocked: true;
  permissionsRequired: readonly OfficeTableReadPermission[];
  unsafeSideEffects: false;
  resultEnvelope: OfficeTableReadEnvelope;
};

export type OfficeTableReadResult =
  | {
      ok: true;
      toolId: "office.tableRead";
      output: OfficeTableReadOutput;
      audit: readonly OfficeTableReadAuditEvent[];
      events: readonly string[];
    }
  | {
      ok: false;
      toolId: "office.tableRead";
      error: OfficeTableReadError;
      audit: readonly OfficeTableReadAuditEvent[];
      events: readonly string[];
    };

export const officeTableReadDescriptor = {
  toolId: "office.tableRead",
  capability: "read-table",
  route: "toolabilityPool.officeBase.spreadsheet",
  defaultDryRun: true,
  tapOwnsApproval: true,
  permissionsRequired: ["filesystem:read", "office:read"],
  unsafeSideEffects: false,
} as const;

function cleanList<T extends string>(values: readonly T[] | undefined): readonly T[] {
  return [...new Set((values ?? []).map((value) => value.trim()).filter(Boolean) as T[])];
}

function dryRunEnabled(context: OfficeTableReadContext | undefined): boolean {
  return context?.dryRun !== false;
}

function invocationId(context: OfficeTableReadContext | undefined): string {
  return context?.invocationId?.trim() || "office.tableRead:dry-run";
}

function auditEvent(
  type: string,
  context: OfficeTableReadContext | undefined,
  targetPath?: string,
  metadata?: Readonly<Record<string, unknown>>,
): OfficeTableReadAuditEvent {
  return {
    type,
    toolId: officeTableReadDescriptor.toolId,
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
  code: OfficeTableReadErrorCode,
  message: string,
  boundary: OfficeTableReadErrorBoundary,
  context: OfficeTableReadContext | undefined,
  targetPath?: string,
): OfficeTableReadResult {
  return {
    ok: false,
    toolId: officeTableReadDescriptor.toolId,
    error: { code, message, boundary, publicSafe: true },
    audit: [auditEvent("agentCore.basicTool.office.tableRead.rejected", context, targetPath, { code })],
    events: ["basicTool.office.tableRead.rejected"],
  };
}

function normalizePath(
  workbookPath: string | undefined,
  context: OfficeTableReadContext | undefined,
): string | OfficeTableReadResult {
  const normalized = workbookPath?.trim() ?? "";
  if (normalized.length === 0) {
    return failure("MISSING_WORKBOOK_PATH", "office.tableRead requires target.workbookPath", "input", context);
  }

  return normalized;
}

function normalizeRoot(root: string): string {
  const trimmed = root.trim();
  return trimmed === "/" ? trimmed : trimmed.replace(/\/+$/, "");
}

function ensureScope(workbookPath: string, context: OfficeTableReadContext | undefined): OfficeTableReadResult | undefined {
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
    "office.tableRead target workbook is outside the allowed file roots",
    "scope",
    context,
    workbookPath,
  );
}

function ensurePermissions(workbookPath: string, context: OfficeTableReadContext | undefined): OfficeTableReadResult | undefined {
  const granted = cleanList(context?.grantedPermissions);
  if (granted.length === 0) {
    return undefined;
  }

  const missing = officeTableReadDescriptor.permissionsRequired.filter((permission) => !granted.includes(permission));
  if (missing.length === 0) {
    return undefined;
  }

  return failure(
    "PERMISSION_DENIED",
    `office.tableRead is missing permissions: ${missing.join(", ")}`,
    "permission",
    context,
    workbookPath,
  );
}

function ensureDryRunOnly(
  workbookPath: string,
  context: OfficeTableReadContext | undefined,
): OfficeTableReadResult | undefined {
  if (dryRunEnabled(context)) {
    return undefined;
  }

  return failure(
    "REAL_EXECUTION_BLOCKED",
    "office.tableRead only returns a guarded dry-run read plan in the first implementation",
    "contract",
    context,
    workbookPath,
  );
}

function normalizeRange(
  range: string | undefined,
  context: OfficeTableReadContext | undefined,
  workbookPath: string,
): string | undefined | OfficeTableReadResult {
  const normalized = range?.trim();
  if (normalized === undefined || normalized.length === 0) {
    return undefined;
  }

  if (/^[A-Za-z]{1,3}[1-9]\d*(?::[A-Za-z]{1,3}[1-9]\d*)?$/.test(normalized)) {
    return normalized.toUpperCase();
  }

  return failure("INVALID_RANGE", "office.tableRead target.range must be an A1 cell or A1 range", "input", context, workbookPath);
}

function normalizeValueMode(
  valueMode: string | undefined,
  context: OfficeTableReadContext | undefined,
  workbookPath: string,
): OfficeTableReadValueMode | OfficeTableReadResult {
  if (valueMode === undefined || valueMode === "display") {
    return "display";
  }

  if (valueMode === "raw" || valueMode === "formula") {
    return valueMode;
  }

  return failure(
    "INVALID_VALUE_MODE",
    "office.tableRead target.valueMode must be display, raw, or formula",
    "input",
    context,
    workbookPath,
  );
}

function normalizeLimit(
  value: number | undefined,
  fallback: number,
  max: number,
  fieldName: "maxRows" | "maxColumns",
  context: OfficeTableReadContext | undefined,
  workbookPath: string,
): number | OfficeTableReadResult {
  if (value === undefined) {
    return fallback;
  }

  if (Number.isInteger(value) && value > 0 && value <= max) {
    return value;
  }

  return failure(
    "INVALID_RESOURCE_LIMIT",
    `office.tableRead target.${fieldName} must be a positive integer no greater than ${max}`,
    "input",
    context,
    workbookPath,
  );
}

function normalizeTarget(
  target: Partial<OfficeTableReadTarget> | undefined,
  context: OfficeTableReadContext | undefined,
): OfficeTableReadTarget | OfficeTableReadResult {
  const workbookPath = normalizePath(target?.workbookPath, context);
  if (typeof workbookPath !== "string") {
    return workbookPath;
  }

  const range = normalizeRange(target?.range, context, workbookPath);
  if (range !== undefined && typeof range !== "string") {
    return range;
  }

  const valueMode = normalizeValueMode(target?.valueMode, context, workbookPath);
  if (typeof valueMode !== "string") {
    return valueMode;
  }

  const maxRows = normalizeLimit(target?.maxRows, 500, 10000, "maxRows", context, workbookPath);
  if (typeof maxRows !== "number") {
    return maxRows;
  }

  const maxColumns = normalizeLimit(target?.maxColumns, 100, 1000, "maxColumns", context, workbookPath);
  if (typeof maxColumns !== "number") {
    return maxColumns;
  }

  return {
    workbookPath,
    sheetName: target?.sheetName?.trim() || undefined,
    range,
    valueMode,
    includeHeaderRow: target?.includeHeaderRow === true,
    maxRows,
    maxColumns,
  };
}

export function planOfficeTableRead(request: OfficeTableReadRequest = {}): OfficeTableReadResult {
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
    toolId: officeTableReadDescriptor.toolId,
    output: {
      kind: "agentCore.basicTool.office.tableRead",
      target,
      dryRun: true,
      executionBlocked: true,
      permissionsRequired: officeTableReadDescriptor.permissionsRequired,
      unsafeSideEffects: false,
      resultEnvelope: {
        workbookPath: target.workbookPath,
        sheetName: target.sheetName,
        range: target.range,
        rows: [],
        headerRow: target.includeHeaderRow ? [] : undefined,
        truncated: false,
        metadata: {
          valueMode: target.valueMode,
          includeHeaderRow: target.includeHeaderRow,
          maxRows: target.maxRows,
          maxColumns: target.maxColumns,
        },
      },
    },
    audit: [
      auditEvent("agentCore.basicTool.office.tableRead.dryRun", request.context, target.workbookPath, {
        sheetName: target.sheetName,
        range: target.range,
        valueMode: target.valueMode,
      }),
    ],
    events: ["basicTool.office.tableRead.dryRun"],
  };
}
