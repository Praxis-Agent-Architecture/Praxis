/*
 * 文件定位：Agent 执行引擎 / 基础工具原语层 / 基础工具集合 / 办公文档基础工具 / 表格工具。
 * 核心目的：提供 办公文档基础工具 / 表格工具 中的“编码表格”基础能力原语。
 * 能力要求1：需要定义该能力的输入、输出、错误、权限需求和可观测事件。
 * 能力要求2：这些基础工具是 Agent 成立的底层能力，不是 TAP 的最终高级工具库。
 * 能力要求3：后续 TAP 可以基于这些原语构建更强的工具编排、审批、替换和专业能力库。
 * 边界：保留 Agent 基础工具原语，不替代 TAP 的高级工具系统。
 * 对接：需要被 runtime.execEngine 拉起，并和 mainLoop、stateEngine、事件暴露、工具调用策略接通。
 * 实现提示：先补稳定类型契约、最小可测行为和清晰错误边界，再接入真实执行逻辑。
 */

export type OfficeTableEncodePermission = "filesystem:write" | "office:write";

export type OfficeTableEncodeErrorBoundary = "input" | "scope" | "permission" | "contract";

export type OfficeTableEncodeContext = {
  runtimeId?: string;
  invocationId?: string;
  dryRun?: boolean;
  allowedFileRoots?: readonly string[];
  grantedPermissions?: readonly OfficeTableEncodePermission[];
  auditMetadata?: Readonly<Record<string, unknown>>;
};

export type OfficeTableEncodeFormat = "xlsx" | "csv" | "tsv";

export type OfficeTableEncodeCellValue = string | number | boolean | null;

export type OfficeTableEncodeRow = readonly OfficeTableEncodeCellValue[];

export type OfficeTableEncodeSheet = {
  name: string;
  rows: readonly OfficeTableEncodeRow[];
};

export type OfficeTableEncodeSheetInput = {
  name?: string;
  rows?: readonly (readonly OfficeTableEncodeCellValue[])[];
};

export type OfficeTableEncodeTarget = {
  outputPath: string;
  format: OfficeTableEncodeFormat;
  sheets: readonly OfficeTableEncodeSheet[];
  overwrite: boolean;
};

export type OfficeTableEncodeRequest = {
  target?: {
    outputPath?: string;
    format?: OfficeTableEncodeFormat;
    sheets?: readonly OfficeTableEncodeSheetInput[];
    overwrite?: boolean;
  };
  context?: OfficeTableEncodeContext;
};

export type OfficeTableEncodeErrorCode =
  | "MISSING_OUTPUT_PATH"
  | "INVALID_FORMAT"
  | "MISSING_SHEETS"
  | "MISSING_SHEET_NAME"
  | "MISSING_ROWS"
  | "RESOURCE_LIMIT_EXCEEDED"
  | "SCOPE_REJECTED"
  | "PERMISSION_DENIED"
  | "REAL_EXECUTION_BLOCKED";

export type OfficeTableEncodeError = {
  code: OfficeTableEncodeErrorCode;
  message: string;
  boundary: OfficeTableEncodeErrorBoundary;
  publicSafe: true;
};

export type OfficeTableEncodeAuditEvent = {
  type: string;
  toolId: "office.tableEncode";
  invocationId: string;
  dryRun: boolean;
  targetPath?: string;
  metadata: Readonly<Record<string, unknown>>;
};

export type OfficeTableEncodeOutput = {
  kind: "agentCore.basicTool.office.tableEncode";
  target: OfficeTableEncodeTarget;
  dryRun: true;
  executionBlocked: true;
  permissionsRequired: readonly OfficeTableEncodePermission[];
  unsafeSideEffects: true;
  writePlan: {
    format: OfficeTableEncodeFormat;
    sheetCount: number;
    rowCount: number;
    cellCount: number;
    overwrite: boolean;
  };
};

export type OfficeTableEncodeResult =
  | {
      ok: true;
      toolId: "office.tableEncode";
      output: OfficeTableEncodeOutput;
      audit: readonly OfficeTableEncodeAuditEvent[];
      events: readonly string[];
    }
  | {
      ok: false;
      toolId: "office.tableEncode";
      error: OfficeTableEncodeError;
      audit: readonly OfficeTableEncodeAuditEvent[];
      events: readonly string[];
    };

export const officeTableEncodeDescriptor = {
  toolId: "office.tableEncode",
  capability: "encode-table",
  route: "agent_executionEngine.basic_toolLayer.baseTools.officeBase.spreadsheet",
  defaultDryRun: true,
  tapOwnsApproval: true,
  permissionsRequired: ["filesystem:write", "office:write"],
  unsafeSideEffects: true,
} as const;

function cleanList<T extends string>(values: readonly T[] | undefined): readonly T[] {
  return [...new Set((values ?? []).map((value) => value.trim()).filter(Boolean) as T[])];
}

function dryRunEnabled(context: OfficeTableEncodeContext | undefined): boolean {
  return context?.dryRun !== false;
}

function invocationId(context: OfficeTableEncodeContext | undefined): string {
  return context?.invocationId?.trim() || "office.tableEncode:dry-run";
}

function auditEvent(
  type: string,
  context: OfficeTableEncodeContext | undefined,
  targetPath?: string,
  metadata?: Readonly<Record<string, unknown>>,
): OfficeTableEncodeAuditEvent {
  return {
    type,
    toolId: officeTableEncodeDescriptor.toolId,
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
  code: OfficeTableEncodeErrorCode,
  message: string,
  boundary: OfficeTableEncodeErrorBoundary,
  context: OfficeTableEncodeContext | undefined,
  targetPath?: string,
): OfficeTableEncodeResult {
  return {
    ok: false,
    toolId: officeTableEncodeDescriptor.toolId,
    error: { code, message, boundary, publicSafe: true },
    audit: [auditEvent("agentCore.basicTool.office.tableEncode.rejected", context, targetPath, { code })],
    events: ["basicTool.office.tableEncode.rejected"],
  };
}

function normalizePath(
  outputPath: string | undefined,
  context: OfficeTableEncodeContext | undefined,
): string | OfficeTableEncodeResult {
  const normalized = outputPath?.trim() ?? "";
  if (normalized.length === 0) {
    return failure("MISSING_OUTPUT_PATH", "office.tableEncode requires target.outputPath", "input", context);
  }

  return normalized;
}

function normalizeRoot(root: string): string {
  const trimmed = root.trim();
  return trimmed === "/" ? trimmed : trimmed.replace(/\/+$/, "");
}

function ensureScope(outputPath: string, context: OfficeTableEncodeContext | undefined): OfficeTableEncodeResult | undefined {
  const allowedRoots = cleanList(context?.allowedFileRoots).map(normalizeRoot);
  if (allowedRoots.length === 0) {
    return undefined;
  }

  const allowed = allowedRoots.some((root) => outputPath === root || outputPath.startsWith(`${root}/`));
  if (allowed) {
    return undefined;
  }

  return failure(
    "SCOPE_REJECTED",
    "office.tableEncode target output is outside the allowed file roots",
    "scope",
    context,
    outputPath,
  );
}

function ensurePermissions(outputPath: string, context: OfficeTableEncodeContext | undefined): OfficeTableEncodeResult | undefined {
  const granted = cleanList(context?.grantedPermissions);
  if (granted.length === 0) {
    return undefined;
  }

  const missing = officeTableEncodeDescriptor.permissionsRequired.filter((permission) => !granted.includes(permission));
  if (missing.length === 0) {
    return undefined;
  }

  return failure(
    "PERMISSION_DENIED",
    `office.tableEncode is missing permissions: ${missing.join(", ")}`,
    "permission",
    context,
    outputPath,
  );
}

function ensureDryRunOnly(outputPath: string, context: OfficeTableEncodeContext | undefined): OfficeTableEncodeResult | undefined {
  if (dryRunEnabled(context)) {
    return undefined;
  }

  return failure(
    "REAL_EXECUTION_BLOCKED",
    "office.tableEncode only returns a guarded dry-run encode plan in the first implementation",
    "contract",
    context,
    outputPath,
  );
}

function normalizeFormat(
  format: string | undefined,
  context: OfficeTableEncodeContext | undefined,
  outputPath: string,
): OfficeTableEncodeFormat | OfficeTableEncodeResult {
  if (format === undefined || format === "xlsx") {
    return "xlsx";
  }

  if (format === "csv" || format === "tsv") {
    return format;
  }

  return failure("INVALID_FORMAT", "office.tableEncode target.format must be xlsx, csv, or tsv", "input", context, outputPath);
}

function normalizeSheets(
  sheets: readonly OfficeTableEncodeSheetInput[] | undefined,
  context: OfficeTableEncodeContext | undefined,
  outputPath: string,
): readonly OfficeTableEncodeSheet[] | OfficeTableEncodeResult {
  if (sheets === undefined || sheets.length === 0) {
    return failure("MISSING_SHEETS", "office.tableEncode requires at least one target sheet", "input", context, outputPath);
  }

  if (sheets.length > 50) {
    return failure("RESOURCE_LIMIT_EXCEEDED", "office.tableEncode supports at most 50 sheets in the first implementation", "input", context, outputPath);
  }

  const normalized: OfficeTableEncodeSheet[] = [];
  for (const sheet of sheets) {
    const name = sheet.name?.trim() ?? "";
    if (name.length === 0) {
      return failure("MISSING_SHEET_NAME", "office.tableEncode sheet.name is required", "input", context, outputPath);
    }

    if (sheet.rows === undefined || sheet.rows.length === 0) {
      return failure("MISSING_ROWS", "office.tableEncode sheet.rows must contain at least one row", "input", context, outputPath);
    }

    if (sheet.rows.length > 10000) {
      return failure("RESOURCE_LIMIT_EXCEEDED", "office.tableEncode supports at most 10000 rows per sheet", "input", context, outputPath);
    }

    normalized.push({
      name,
      rows: sheet.rows.map((row) => [...row]),
    });
  }

  return normalized;
}

function normalizeTarget(
  target: OfficeTableEncodeRequest["target"] | undefined,
  context: OfficeTableEncodeContext | undefined,
): OfficeTableEncodeTarget | OfficeTableEncodeResult {
  const outputPath = normalizePath(target?.outputPath, context);
  if (typeof outputPath !== "string") {
    return outputPath;
  }

  const format = normalizeFormat(target?.format, context, outputPath);
  if (typeof format !== "string") {
    return format;
  }

  const sheets = normalizeSheets(target?.sheets, context, outputPath);
  if ("ok" in sheets) {
    return sheets;
  }

  return {
    outputPath,
    format,
    sheets,
    overwrite: target?.overwrite === true,
  };
}

function rowCount(sheets: readonly OfficeTableEncodeSheet[]): number {
  return sheets.reduce((sum, sheet) => sum + sheet.rows.length, 0);
}

function cellCount(sheets: readonly OfficeTableEncodeSheet[]): number {
  return sheets.reduce((sum, sheet) => sum + sheet.rows.reduce((rowSum, row) => rowSum + row.length, 0), 0);
}

export function planOfficeTableEncode(request: OfficeTableEncodeRequest = {}): OfficeTableEncodeResult {
  const target = normalizeTarget(request.target, request.context);
  if ("ok" in target) {
    return target;
  }

  const scopeFailure = ensureScope(target.outputPath, request.context);
  if (scopeFailure !== undefined) {
    return scopeFailure;
  }

  const permissionFailure = ensurePermissions(target.outputPath, request.context);
  if (permissionFailure !== undefined) {
    return permissionFailure;
  }

  const realExecutionFailure = ensureDryRunOnly(target.outputPath, request.context);
  if (realExecutionFailure !== undefined) {
    return realExecutionFailure;
  }

  return {
    ok: true,
    toolId: officeTableEncodeDescriptor.toolId,
    output: {
      kind: "agentCore.basicTool.office.tableEncode",
      target,
      dryRun: true,
      executionBlocked: true,
      permissionsRequired: officeTableEncodeDescriptor.permissionsRequired,
      unsafeSideEffects: true,
      writePlan: {
        format: target.format,
        sheetCount: target.sheets.length,
        rowCount: rowCount(target.sheets),
        cellCount: cellCount(target.sheets),
        overwrite: target.overwrite,
      },
    },
    audit: [
      auditEvent("agentCore.basicTool.office.tableEncode.dryRun", request.context, target.outputPath, {
        format: target.format,
        sheetCount: target.sheets.length,
        overwrite: target.overwrite,
      }),
    ],
    events: ["basicTool.office.tableEncode.dryRun"],
  };
}
