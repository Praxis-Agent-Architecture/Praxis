/*
 * 文件定位：Agent 执行引擎 / 基础工具原语层 / 基础工具集合 / 办公文档基础工具 / 表格工具。
 * 核心目的：提供 办公文档基础工具 / 表格工具 中的“解码表格”基础能力原语。
 * 能力要求1：需要定义该能力的输入、输出、错误、权限需求和可观测事件。
 * 能力要求2：这些基础工具是 Agent 成立的底层能力，不是 TAP 的最终高级工具库。
 * 能力要求3：后续 TAP 可以基于这些原语构建更强的工具编排、审批、替换和专业能力库。
 * 边界：保留 Agent 基础工具原语，不替代 TAP 的高级工具系统。
 * 对接：需要被 runtime.execEngine 拉起，并和 mainLoop、stateEngine、事件暴露、工具调用策略接通。
 * 实现提示：先补稳定类型契约、最小可测行为和清晰错误边界，再接入真实执行逻辑。
 */

export type OfficeTableDecodePermission = "filesystem:read" | "office:read";

export type OfficeTableDecodeErrorBoundary = "input" | "scope" | "permission" | "contract";

export type OfficeTableDecodeContext = {
  runtimeId?: string;
  invocationId?: string;
  dryRun?: boolean;
  allowedFileRoots?: readonly string[];
  grantedPermissions?: readonly OfficeTableDecodePermission[];
  auditMetadata?: Readonly<Record<string, unknown>>;
};

export type OfficeTableDecodeValueMode = "display" | "raw";

export type OfficeTableDecodeTarget = {
  workbookPath: string;
  sheetName?: string;
  range?: string;
  valueMode: OfficeTableDecodeValueMode;
  includeFormulas: boolean;
  maxRows: number;
  maxColumns: number;
};

export type OfficeTableDecodeRequest = {
  target?: Partial<OfficeTableDecodeTarget>;
  context?: OfficeTableDecodeContext;
};

export type OfficeTableDecodedCell = {
  address: string;
  value: string | number | boolean | null;
  formula?: string;
};

export type OfficeTableDecodedEnvelope = {
  workbookPath: string;
  sheetName?: string;
  range?: string;
  rows: readonly (readonly OfficeTableDecodedCell[])[];
  truncated: false;
  metadata: {
    valueMode: OfficeTableDecodeValueMode;
    includeFormulas: boolean;
    maxRows: number;
    maxColumns: number;
  };
};

export type OfficeTableDecodeErrorCode =
  | "MISSING_WORKBOOK_PATH"
  | "INVALID_RANGE"
  | "INVALID_VALUE_MODE"
  | "INVALID_RESOURCE_LIMIT"
  | "SCOPE_REJECTED"
  | "PERMISSION_DENIED"
  | "REAL_EXECUTION_BLOCKED";

export type OfficeTableDecodeError = {
  code: OfficeTableDecodeErrorCode;
  message: string;
  boundary: OfficeTableDecodeErrorBoundary;
  publicSafe: true;
};

export type OfficeTableDecodeAuditEvent = {
  type: string;
  toolId: "office.tableDecode";
  invocationId: string;
  dryRun: boolean;
  targetPath?: string;
  metadata: Readonly<Record<string, unknown>>;
};

export type OfficeTableDecodeOutput = {
  kind: "agentCore.basicTool.office.tableDecode";
  target: OfficeTableDecodeTarget;
  dryRun: true;
  executionBlocked: true;
  permissionsRequired: readonly OfficeTableDecodePermission[];
  unsafeSideEffects: false;
  resultEnvelope: OfficeTableDecodedEnvelope;
};

export type OfficeTableDecodeResult =
  | {
      ok: true;
      toolId: "office.tableDecode";
      output: OfficeTableDecodeOutput;
      audit: readonly OfficeTableDecodeAuditEvent[];
      events: readonly string[];
    }
  | {
      ok: false;
      toolId: "office.tableDecode";
      error: OfficeTableDecodeError;
      audit: readonly OfficeTableDecodeAuditEvent[];
      events: readonly string[];
    };

export const officeTableDecodeDescriptor = {
  toolId: "office.tableDecode",
  capability: "decode-table",
  route: "agent_executionEngine.basic_toolLayer.baseTools.officeBase.spreadsheet",
  defaultDryRun: true,
  tapOwnsApproval: true,
  permissionsRequired: ["filesystem:read", "office:read"],
  unsafeSideEffects: false,
} as const;

function cleanList<T extends string>(values: readonly T[] | undefined): readonly T[] {
  return [...new Set((values ?? []).map((value) => value.trim()).filter(Boolean) as T[])];
}

function dryRunEnabled(context: OfficeTableDecodeContext | undefined): boolean {
  return context?.dryRun !== false;
}

function invocationId(context: OfficeTableDecodeContext | undefined): string {
  return context?.invocationId?.trim() || "office.tableDecode:dry-run";
}

function auditEvent(
  type: string,
  context: OfficeTableDecodeContext | undefined,
  targetPath?: string,
  metadata?: Readonly<Record<string, unknown>>,
): OfficeTableDecodeAuditEvent {
  return {
    type,
    toolId: officeTableDecodeDescriptor.toolId,
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
  code: OfficeTableDecodeErrorCode,
  message: string,
  boundary: OfficeTableDecodeErrorBoundary,
  context: OfficeTableDecodeContext | undefined,
  targetPath?: string,
): OfficeTableDecodeResult {
  return {
    ok: false,
    toolId: officeTableDecodeDescriptor.toolId,
    error: { code, message, boundary, publicSafe: true },
    audit: [auditEvent("agentCore.basicTool.office.tableDecode.rejected", context, targetPath, { code })],
    events: ["basicTool.office.tableDecode.rejected"],
  };
}

function normalizePath(
  workbookPath: string | undefined,
  context: OfficeTableDecodeContext | undefined,
): string | OfficeTableDecodeResult {
  const normalized = workbookPath?.trim() ?? "";
  if (normalized.length === 0) {
    return failure("MISSING_WORKBOOK_PATH", "office.tableDecode requires target.workbookPath", "input", context);
  }

  return normalized;
}

function normalizeRoot(root: string): string {
  const trimmed = root.trim();
  return trimmed === "/" ? trimmed : trimmed.replace(/\/+$/, "");
}

function ensureScope(workbookPath: string, context: OfficeTableDecodeContext | undefined): OfficeTableDecodeResult | undefined {
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
    "office.tableDecode target workbook is outside the allowed file roots",
    "scope",
    context,
    workbookPath,
  );
}

function ensurePermissions(workbookPath: string, context: OfficeTableDecodeContext | undefined): OfficeTableDecodeResult | undefined {
  const granted = cleanList(context?.grantedPermissions);
  if (granted.length === 0) {
    return undefined;
  }

  const missing = officeTableDecodeDescriptor.permissionsRequired.filter((permission) => !granted.includes(permission));
  if (missing.length === 0) {
    return undefined;
  }

  return failure(
    "PERMISSION_DENIED",
    `office.tableDecode is missing permissions: ${missing.join(", ")}`,
    "permission",
    context,
    workbookPath,
  );
}

function ensureDryRunOnly(workbookPath: string, context: OfficeTableDecodeContext | undefined): OfficeTableDecodeResult | undefined {
  if (dryRunEnabled(context)) {
    return undefined;
  }

  return failure(
    "REAL_EXECUTION_BLOCKED",
    "office.tableDecode only returns a guarded dry-run decode plan in the first implementation",
    "contract",
    context,
    workbookPath,
  );
}

function normalizeRange(
  range: string | undefined,
  context: OfficeTableDecodeContext | undefined,
  workbookPath: string,
): string | undefined | OfficeTableDecodeResult {
  const normalized = range?.trim();
  if (normalized === undefined || normalized.length === 0) {
    return undefined;
  }

  if (/^[A-Za-z]{1,3}[1-9]\d*(?::[A-Za-z]{1,3}[1-9]\d*)?$/.test(normalized)) {
    return normalized.toUpperCase();
  }

  return failure("INVALID_RANGE", "office.tableDecode target.range must be an A1 cell or A1 range", "input", context, workbookPath);
}

function normalizeValueMode(
  valueMode: string | undefined,
  context: OfficeTableDecodeContext | undefined,
  workbookPath: string,
): OfficeTableDecodeValueMode | OfficeTableDecodeResult {
  if (valueMode === undefined || valueMode === "display") {
    return "display";
  }

  if (valueMode === "raw") {
    return "raw";
  }

  return failure("INVALID_VALUE_MODE", "office.tableDecode target.valueMode must be display or raw", "input", context, workbookPath);
}

function normalizeLimit(
  value: number | undefined,
  fallback: number,
  max: number,
  fieldName: "maxRows" | "maxColumns",
  context: OfficeTableDecodeContext | undefined,
  workbookPath: string,
): number | OfficeTableDecodeResult {
  if (value === undefined) {
    return fallback;
  }

  if (Number.isInteger(value) && value > 0 && value <= max) {
    return value;
  }

  return failure(
    "INVALID_RESOURCE_LIMIT",
    `office.tableDecode target.${fieldName} must be a positive integer no greater than ${max}`,
    "input",
    context,
    workbookPath,
  );
}

function normalizeTarget(
  target: Partial<OfficeTableDecodeTarget> | undefined,
  context: OfficeTableDecodeContext | undefined,
): OfficeTableDecodeTarget | OfficeTableDecodeResult {
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

  const maxRows = normalizeLimit(target?.maxRows, 200, 10000, "maxRows", context, workbookPath);
  if (typeof maxRows !== "number") {
    return maxRows;
  }

  const maxColumns = normalizeLimit(target?.maxColumns, 50, 1000, "maxColumns", context, workbookPath);
  if (typeof maxColumns !== "number") {
    return maxColumns;
  }

  const sheetName = target?.sheetName?.trim() || undefined;

  return {
    workbookPath,
    sheetName,
    range,
    valueMode,
    includeFormulas: target?.includeFormulas === true,
    maxRows,
    maxColumns,
  };
}

export function planOfficeTableDecode(request: OfficeTableDecodeRequest = {}): OfficeTableDecodeResult {
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
    toolId: officeTableDecodeDescriptor.toolId,
    output: {
      kind: "agentCore.basicTool.office.tableDecode",
      target,
      dryRun: true,
      executionBlocked: true,
      permissionsRequired: officeTableDecodeDescriptor.permissionsRequired,
      unsafeSideEffects: false,
      resultEnvelope: {
        workbookPath: target.workbookPath,
        sheetName: target.sheetName,
        range: target.range,
        rows: [],
        truncated: false,
        metadata: {
          valueMode: target.valueMode,
          includeFormulas: target.includeFormulas,
          maxRows: target.maxRows,
          maxColumns: target.maxColumns,
        },
      },
    },
    audit: [
      auditEvent("agentCore.basicTool.office.tableDecode.dryRun", request.context, target.workbookPath, {
        sheetName: target.sheetName,
        range: target.range,
        includeFormulas: target.includeFormulas,
      }),
    ],
    events: ["basicTool.office.tableDecode.dryRun"],
  };
}
