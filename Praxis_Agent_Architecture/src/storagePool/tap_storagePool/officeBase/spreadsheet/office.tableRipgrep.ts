/*
 * 文件定位：ToolabilityPool / TAP 高级工具系统 / Office 工具集合 / 表格工具。
 * 核心目的：提供 办公文档基础工具 / 表格工具 中的“检索表格”基础能力原语。
 * 能力要求1：需要定义该能力的输入、输出、错误、权限需求和可观测事件。
 * 能力要求2：这些 Office 能力由 TAP 高级工具系统承接，不再作为 baseTool 完成目标。
 * 能力要求3：TAP 负责 Office 能力的治理、审批、组合和专业能力库承接。
 * 边界：承接 Office 高级工具能力，不回写到 agentCore baseTools。
 * 对接：通过 TAP 复用转交与 runtime 官方模块桥接接通，并保留治理、审批和审计边界。
 * 实现提示：先补稳定类型契约、最小可测行为和清晰错误边界，再接入真实执行逻辑。
 */

export type OfficeTableRipgrepPermission = "filesystem:read" | "office:read";

export type OfficeTableRipgrepErrorBoundary = "input" | "scope" | "permission" | "contract";

export type OfficeTableRipgrepContext = {
  runtimeId?: string;
  invocationId?: string;
  dryRun?: boolean;
  allowedFileRoots?: readonly string[];
  grantedPermissions?: readonly OfficeTableRipgrepPermission[];
  auditMetadata?: Readonly<Record<string, unknown>>;
};

export type OfficeTableRipgrepTarget = {
  workbookPath: string;
  sheetName?: string;
  pattern: string;
  regex: boolean;
  caseSensitive: boolean;
  ranges: readonly string[];
  maxMatches: number;
};

export type OfficeTableRipgrepRequest = {
  target?: {
    workbookPath?: string;
    sheetName?: string;
    pattern?: string;
    regex?: boolean;
    caseSensitive?: boolean;
    ranges?: readonly string[];
    maxMatches?: number;
  };
  context?: OfficeTableRipgrepContext;
};

export type OfficeTableRipgrepMatch = {
  sheetName?: string;
  address: string;
  valuePreview: string;
  matchStart?: number;
  matchEnd?: number;
};

export type OfficeTableRipgrepEnvelope = {
  workbookPath: string;
  sheetName?: string;
  pattern: string;
  matches: readonly OfficeTableRipgrepMatch[];
  truncated: false;
  metadata: {
    regex: boolean;
    caseSensitive: boolean;
    ranges: readonly string[];
    maxMatches: number;
  };
};

export type OfficeTableRipgrepErrorCode =
  | "MISSING_WORKBOOK_PATH"
  | "MISSING_PATTERN"
  | "INVALID_PATTERN"
  | "INVALID_RANGE"
  | "INVALID_RESOURCE_LIMIT"
  | "SCOPE_REJECTED"
  | "PERMISSION_DENIED"
  | "REAL_EXECUTION_BLOCKED";

export type OfficeTableRipgrepError = {
  code: OfficeTableRipgrepErrorCode;
  message: string;
  boundary: OfficeTableRipgrepErrorBoundary;
  publicSafe: true;
};

export type OfficeTableRipgrepAuditEvent = {
  type: string;
  toolId: "office.tableRipgrep";
  invocationId: string;
  dryRun: boolean;
  targetPath?: string;
  metadata: Readonly<Record<string, unknown>>;
};

export type OfficeTableRipgrepOutput = {
  kind: "agentCore.basicTool.office.tableRipgrep";
  target: OfficeTableRipgrepTarget;
  dryRun: true;
  executionBlocked: true;
  permissionsRequired: readonly OfficeTableRipgrepPermission[];
  unsafeSideEffects: false;
  resultEnvelope: OfficeTableRipgrepEnvelope;
};

export type OfficeTableRipgrepResult =
  | {
      ok: true;
      toolId: "office.tableRipgrep";
      output: OfficeTableRipgrepOutput;
      audit: readonly OfficeTableRipgrepAuditEvent[];
      events: readonly string[];
    }
  | {
      ok: false;
      toolId: "office.tableRipgrep";
      error: OfficeTableRipgrepError;
      audit: readonly OfficeTableRipgrepAuditEvent[];
      events: readonly string[];
    };

export const officeTableRipgrepDescriptor = {
  toolId: "office.tableRipgrep",
  capability: "ripgrep-table",
  route: "toolabilityPool.officeBase.spreadsheet",
  defaultDryRun: true,
  tapOwnsApproval: true,
  permissionsRequired: ["filesystem:read", "office:read"],
  unsafeSideEffects: false,
} as const;

function cleanList<T extends string>(values: readonly T[] | undefined): readonly T[] {
  return [...new Set((values ?? []).map((value) => value.trim()).filter(Boolean) as T[])];
}

function dryRunEnabled(context: OfficeTableRipgrepContext | undefined): boolean {
  return context?.dryRun !== false;
}

function invocationId(context: OfficeTableRipgrepContext | undefined): string {
  return context?.invocationId?.trim() || "office.tableRipgrep:dry-run";
}

function auditEvent(
  type: string,
  context: OfficeTableRipgrepContext | undefined,
  targetPath?: string,
  metadata?: Readonly<Record<string, unknown>>,
): OfficeTableRipgrepAuditEvent {
  return {
    type,
    toolId: officeTableRipgrepDescriptor.toolId,
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
  code: OfficeTableRipgrepErrorCode,
  message: string,
  boundary: OfficeTableRipgrepErrorBoundary,
  context: OfficeTableRipgrepContext | undefined,
  targetPath?: string,
): OfficeTableRipgrepResult {
  return {
    ok: false,
    toolId: officeTableRipgrepDescriptor.toolId,
    error: { code, message, boundary, publicSafe: true },
    audit: [auditEvent("agentCore.basicTool.office.tableRipgrep.rejected", context, targetPath, { code })],
    events: ["basicTool.office.tableRipgrep.rejected"],
  };
}

function normalizePath(
  workbookPath: string | undefined,
  context: OfficeTableRipgrepContext | undefined,
): string | OfficeTableRipgrepResult {
  const normalized = workbookPath?.trim() ?? "";
  if (normalized.length === 0) {
    return failure("MISSING_WORKBOOK_PATH", "office.tableRipgrep requires target.workbookPath", "input", context);
  }

  return normalized;
}

function normalizeRoot(root: string): string {
  const trimmed = root.trim();
  return trimmed === "/" ? trimmed : trimmed.replace(/\/+$/, "");
}

function ensureScope(
  workbookPath: string,
  context: OfficeTableRipgrepContext | undefined,
): OfficeTableRipgrepResult | undefined {
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
    "office.tableRipgrep target workbook is outside the allowed file roots",
    "scope",
    context,
    workbookPath,
  );
}

function ensurePermissions(
  workbookPath: string,
  context: OfficeTableRipgrepContext | undefined,
): OfficeTableRipgrepResult | undefined {
  const granted = cleanList(context?.grantedPermissions);
  if (granted.length === 0) {
    return undefined;
  }

  const missing = officeTableRipgrepDescriptor.permissionsRequired.filter((permission) => !granted.includes(permission));
  if (missing.length === 0) {
    return undefined;
  }

  return failure(
    "PERMISSION_DENIED",
    `office.tableRipgrep is missing permissions: ${missing.join(", ")}`,
    "permission",
    context,
    workbookPath,
  );
}

function ensureDryRunOnly(
  workbookPath: string,
  context: OfficeTableRipgrepContext | undefined,
): OfficeTableRipgrepResult | undefined {
  if (dryRunEnabled(context)) {
    return undefined;
  }

  return failure(
    "REAL_EXECUTION_BLOCKED",
    "office.tableRipgrep only returns a guarded dry-run search plan in the first implementation",
    "contract",
    context,
    workbookPath,
  );
}

function normalizePattern(
  pattern: string | undefined,
  regex: boolean,
  context: OfficeTableRipgrepContext | undefined,
  workbookPath: string,
): string | OfficeTableRipgrepResult {
  const normalized = pattern?.trim() ?? "";
  if (normalized.length === 0) {
    return failure("MISSING_PATTERN", "office.tableRipgrep requires target.pattern", "input", context, workbookPath);
  }

  if (regex) {
    try {
      new RegExp(normalized);
    } catch {
      return failure("INVALID_PATTERN", "office.tableRipgrep target.pattern is not a valid regular expression", "input", context, workbookPath);
    }
  }

  return normalized;
}

function normalizeRange(
  range: string,
  context: OfficeTableRipgrepContext | undefined,
  workbookPath: string,
): string | OfficeTableRipgrepResult {
  const normalized = range.trim().toUpperCase();
  if (/^[A-Z]{1,3}[1-9]\d*(?::[A-Z]{1,3}[1-9]\d*)?$/.test(normalized)) {
    return normalized;
  }

  return failure("INVALID_RANGE", "office.tableRipgrep target.ranges must contain A1 cells or A1 ranges", "input", context, workbookPath);
}

function normalizeRanges(
  ranges: readonly string[] | undefined,
  context: OfficeTableRipgrepContext | undefined,
  workbookPath: string,
): readonly string[] | OfficeTableRipgrepResult {
  if (ranges === undefined || ranges.length === 0) {
    return [];
  }

  const normalizedRanges: string[] = [];
  for (const range of ranges) {
    const normalized = normalizeRange(range, context, workbookPath);
    if (typeof normalized !== "string") {
      return normalized;
    }

    normalizedRanges.push(normalized);
  }

  return [...new Set(normalizedRanges)];
}

function normalizeMaxMatches(
  maxMatches: number | undefined,
  context: OfficeTableRipgrepContext | undefined,
  workbookPath: string,
): number | OfficeTableRipgrepResult {
  if (maxMatches === undefined) {
    return 100;
  }

  if (Number.isInteger(maxMatches) && maxMatches > 0 && maxMatches <= 10000) {
    return maxMatches;
  }

  return failure(
    "INVALID_RESOURCE_LIMIT",
    "office.tableRipgrep target.maxMatches must be a positive integer no greater than 10000",
    "input",
    context,
    workbookPath,
  );
}

function normalizeTarget(
  target: OfficeTableRipgrepRequest["target"] | undefined,
  context: OfficeTableRipgrepContext | undefined,
): OfficeTableRipgrepTarget | OfficeTableRipgrepResult {
  const workbookPath = normalizePath(target?.workbookPath, context);
  if (typeof workbookPath !== "string") {
    return workbookPath;
  }

  const regex = target?.regex === true;
  const pattern = normalizePattern(target?.pattern, regex, context, workbookPath);
  if (typeof pattern !== "string") {
    return pattern;
  }

  const ranges = normalizeRanges(target?.ranges, context, workbookPath);
  if ("ok" in ranges) {
    return ranges;
  }

  const maxMatches = normalizeMaxMatches(target?.maxMatches, context, workbookPath);
  if (typeof maxMatches !== "number") {
    return maxMatches;
  }

  return {
    workbookPath,
    sheetName: target?.sheetName?.trim() || undefined,
    pattern,
    regex,
    caseSensitive: target?.caseSensitive === true,
    ranges,
    maxMatches,
  };
}

export function planOfficeTableRipgrep(request: OfficeTableRipgrepRequest = {}): OfficeTableRipgrepResult {
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
    toolId: officeTableRipgrepDescriptor.toolId,
    output: {
      kind: "agentCore.basicTool.office.tableRipgrep",
      target,
      dryRun: true,
      executionBlocked: true,
      permissionsRequired: officeTableRipgrepDescriptor.permissionsRequired,
      unsafeSideEffects: false,
      resultEnvelope: {
        workbookPath: target.workbookPath,
        sheetName: target.sheetName,
        pattern: target.pattern,
        matches: [],
        truncated: false,
        metadata: {
          regex: target.regex,
          caseSensitive: target.caseSensitive,
          ranges: target.ranges,
          maxMatches: target.maxMatches,
        },
      },
    },
    audit: [
      auditEvent("agentCore.basicTool.office.tableRipgrep.dryRun", request.context, target.workbookPath, {
        sheetName: target.sheetName,
        regex: target.regex,
        rangeCount: target.ranges.length,
        maxMatches: target.maxMatches,
      }),
    ],
    events: ["basicTool.office.tableRipgrep.dryRun"],
  };
}
