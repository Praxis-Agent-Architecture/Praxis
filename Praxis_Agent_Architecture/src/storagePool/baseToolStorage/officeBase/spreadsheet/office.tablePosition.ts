/*
 * 文件定位：Agent 执行引擎 / 基础工具原语层 / 基础工具集合 / 办公文档基础工具 / 表格工具。
 * 核心目的：提供 办公文档基础工具 / 表格工具 中的“定位表格内容”基础能力原语。
 * 能力要求1：需要定义该能力的输入、输出、错误、权限需求和可观测事件。
 * 能力要求2：这些基础工具是 Agent 成立的底层能力，不是 TAP 的最终高级工具库。
 * 能力要求3：后续 TAP 可以基于这些原语构建更强的工具编排、审批、替换和专业能力库。
 * 边界：保留 Agent 基础工具原语，不替代 TAP 的高级工具系统。
 * 对接：需要被 runtime.execEngine 拉起，并和 mainLoop、stateEngine、事件暴露、工具调用策略接通。
 * 实现提示：先补稳定类型契约、最小可测行为和清晰错误边界，再接入真实执行逻辑。
 */

export type OfficeTablePositionPermission = "filesystem:read" | "office:read";

export type OfficeTablePositionErrorBoundary = "input" | "scope" | "permission" | "contract";

export type OfficeTablePositionContext = {
  runtimeId?: string;
  invocationId?: string;
  dryRun?: boolean;
  allowedFileRoots?: readonly string[];
  grantedPermissions?: readonly OfficeTablePositionPermission[];
  auditMetadata?: Readonly<Record<string, unknown>>;
};

export type OfficeTablePositionMatchMode = "exact" | "contains";

export type OfficeTablePositionQuery =
  | {
      kind: "cell";
      address: string;
    }
  | {
      kind: "range";
      range: string;
    }
  | {
      kind: "text";
      text: string;
      matchMode: OfficeTablePositionMatchMode;
    };

export type OfficeTablePositionQueryInput =
  | {
      kind?: "cell";
      address?: string;
    }
  | {
      kind?: "range";
      range?: string;
    }
  | {
      kind?: "text";
      text?: string;
      matchMode?: OfficeTablePositionMatchMode;
    };

export type OfficeTablePositionTarget = {
  workbookPath: string;
  sheetName?: string;
  query: OfficeTablePositionQuery;
  maxMatches: number;
  includeNearbyCells: boolean;
};

export type OfficeTablePositionRequest = {
  target?: {
    workbookPath?: string;
    sheetName?: string;
    query?: OfficeTablePositionQueryInput;
    maxMatches?: number;
    includeNearbyCells?: boolean;
  };
  context?: OfficeTablePositionContext;
};

export type OfficeTablePositionMatch = {
  sheetName?: string;
  address: string;
  range?: string;
  textPreview?: string;
  confidence: number;
};

export type OfficeTablePositionEnvelope = {
  workbookPath: string;
  sheetName?: string;
  query: OfficeTablePositionQuery;
  matches: readonly OfficeTablePositionMatch[];
  truncated: false;
  metadata: {
    maxMatches: number;
    includeNearbyCells: boolean;
  };
};

export type OfficeTablePositionErrorCode =
  | "MISSING_WORKBOOK_PATH"
  | "MISSING_QUERY"
  | "INVALID_QUERY"
  | "INVALID_CELL_ADDRESS"
  | "INVALID_RANGE"
  | "INVALID_RESOURCE_LIMIT"
  | "SCOPE_REJECTED"
  | "PERMISSION_DENIED"
  | "REAL_EXECUTION_BLOCKED";

export type OfficeTablePositionError = {
  code: OfficeTablePositionErrorCode;
  message: string;
  boundary: OfficeTablePositionErrorBoundary;
  publicSafe: true;
};

export type OfficeTablePositionAuditEvent = {
  type: string;
  toolId: "office.tablePosition";
  invocationId: string;
  dryRun: boolean;
  targetPath?: string;
  metadata: Readonly<Record<string, unknown>>;
};

export type OfficeTablePositionOutput = {
  kind: "agentCore.basicTool.office.tablePosition";
  target: OfficeTablePositionTarget;
  dryRun: true;
  executionBlocked: true;
  permissionsRequired: readonly OfficeTablePositionPermission[];
  unsafeSideEffects: false;
  resultEnvelope: OfficeTablePositionEnvelope;
};

export type OfficeTablePositionResult =
  | {
      ok: true;
      toolId: "office.tablePosition";
      output: OfficeTablePositionOutput;
      audit: readonly OfficeTablePositionAuditEvent[];
      events: readonly string[];
    }
  | {
      ok: false;
      toolId: "office.tablePosition";
      error: OfficeTablePositionError;
      audit: readonly OfficeTablePositionAuditEvent[];
      events: readonly string[];
    };

export const officeTablePositionDescriptor = {
  toolId: "office.tablePosition",
  capability: "position-table-content",
  route: "agent_executionEngine.basic_toolLayer.baseTools.officeBase.spreadsheet",
  defaultDryRun: true,
  tapOwnsApproval: true,
  permissionsRequired: ["filesystem:read", "office:read"],
  unsafeSideEffects: false,
} as const;

function cleanList<T extends string>(values: readonly T[] | undefined): readonly T[] {
  return [...new Set((values ?? []).map((value) => value.trim()).filter(Boolean) as T[])];
}

function dryRunEnabled(context: OfficeTablePositionContext | undefined): boolean {
  return context?.dryRun !== false;
}

function invocationId(context: OfficeTablePositionContext | undefined): string {
  return context?.invocationId?.trim() || "office.tablePosition:dry-run";
}

function auditEvent(
  type: string,
  context: OfficeTablePositionContext | undefined,
  targetPath?: string,
  metadata?: Readonly<Record<string, unknown>>,
): OfficeTablePositionAuditEvent {
  return {
    type,
    toolId: officeTablePositionDescriptor.toolId,
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
  code: OfficeTablePositionErrorCode,
  message: string,
  boundary: OfficeTablePositionErrorBoundary,
  context: OfficeTablePositionContext | undefined,
  targetPath?: string,
): OfficeTablePositionResult {
  return {
    ok: false,
    toolId: officeTablePositionDescriptor.toolId,
    error: { code, message, boundary, publicSafe: true },
    audit: [auditEvent("agentCore.basicTool.office.tablePosition.rejected", context, targetPath, { code })],
    events: ["basicTool.office.tablePosition.rejected"],
  };
}

function normalizePath(
  workbookPath: string | undefined,
  context: OfficeTablePositionContext | undefined,
): string | OfficeTablePositionResult {
  const normalized = workbookPath?.trim() ?? "";
  if (normalized.length === 0) {
    return failure("MISSING_WORKBOOK_PATH", "office.tablePosition requires target.workbookPath", "input", context);
  }

  return normalized;
}

function normalizeRoot(root: string): string {
  const trimmed = root.trim();
  return trimmed === "/" ? trimmed : trimmed.replace(/\/+$/, "");
}

function ensureScope(
  workbookPath: string,
  context: OfficeTablePositionContext | undefined,
): OfficeTablePositionResult | undefined {
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
    "office.tablePosition target workbook is outside the allowed file roots",
    "scope",
    context,
    workbookPath,
  );
}

function ensurePermissions(
  workbookPath: string,
  context: OfficeTablePositionContext | undefined,
): OfficeTablePositionResult | undefined {
  const granted = cleanList(context?.grantedPermissions);
  if (granted.length === 0) {
    return undefined;
  }

  const missing = officeTablePositionDescriptor.permissionsRequired.filter((permission) => !granted.includes(permission));
  if (missing.length === 0) {
    return undefined;
  }

  return failure(
    "PERMISSION_DENIED",
    `office.tablePosition is missing permissions: ${missing.join(", ")}`,
    "permission",
    context,
    workbookPath,
  );
}

function ensureDryRunOnly(
  workbookPath: string,
  context: OfficeTablePositionContext | undefined,
): OfficeTablePositionResult | undefined {
  if (dryRunEnabled(context)) {
    return undefined;
  }

  return failure(
    "REAL_EXECUTION_BLOCKED",
    "office.tablePosition only returns a guarded dry-run position plan in the first implementation",
    "contract",
    context,
    workbookPath,
  );
}

function normalizeCellAddress(
  address: string | undefined,
  context: OfficeTablePositionContext | undefined,
  workbookPath: string,
): string | OfficeTablePositionResult {
  const normalized = address?.trim().toUpperCase() ?? "";
  if (/^[A-Z]{1,3}[1-9]\d*$/.test(normalized)) {
    return normalized;
  }

  return failure(
    "INVALID_CELL_ADDRESS",
    "office.tablePosition cell query address must be an A1 cell reference",
    "input",
    context,
    workbookPath,
  );
}

function normalizeRange(
  range: string | undefined,
  context: OfficeTablePositionContext | undefined,
  workbookPath: string,
): string | OfficeTablePositionResult {
  const normalized = range?.trim().toUpperCase() ?? "";
  if (/^[A-Z]{1,3}[1-9]\d*(?::[A-Z]{1,3}[1-9]\d*)?$/.test(normalized)) {
    return normalized;
  }

  return failure("INVALID_RANGE", "office.tablePosition range query must be an A1 cell or A1 range", "input", context, workbookPath);
}

function normalizeQuery(
  query: OfficeTablePositionQueryInput | undefined,
  context: OfficeTablePositionContext | undefined,
  workbookPath: string,
): OfficeTablePositionQuery | OfficeTablePositionResult {
  if (query === undefined) {
    return failure("MISSING_QUERY", "office.tablePosition requires target.query", "input", context, workbookPath);
  }

  if (query.kind === "cell") {
    const address = normalizeCellAddress(query.address, context, workbookPath);
    return typeof address === "string" ? { kind: "cell", address } : address;
  }

  if (query.kind === "range") {
    const range = normalizeRange(query.range, context, workbookPath);
    return typeof range === "string" ? { kind: "range", range } : range;
  }

  if (query.kind === "text") {
    const text = query.text?.trim() ?? "";
    if (text.length === 0) {
      return failure("INVALID_QUERY", "office.tablePosition text query requires non-empty text", "input", context, workbookPath);
    }

    return {
      kind: "text",
      text,
      matchMode: query.matchMode ?? "contains",
    };
  }

  return failure("INVALID_QUERY", "office.tablePosition query.kind must be cell, range, or text", "input", context, workbookPath);
}

function normalizeMaxMatches(
  maxMatches: number | undefined,
  context: OfficeTablePositionContext | undefined,
  workbookPath: string,
): number | OfficeTablePositionResult {
  if (maxMatches === undefined) {
    return 25;
  }

  if (Number.isInteger(maxMatches) && maxMatches > 0 && maxMatches <= 1000) {
    return maxMatches;
  }

  return failure(
    "INVALID_RESOURCE_LIMIT",
    "office.tablePosition target.maxMatches must be a positive integer no greater than 1000",
    "input",
    context,
    workbookPath,
  );
}

function normalizeTarget(
  target: OfficeTablePositionRequest["target"] | undefined,
  context: OfficeTablePositionContext | undefined,
): OfficeTablePositionTarget | OfficeTablePositionResult {
  const workbookPath = normalizePath(target?.workbookPath, context);
  if (typeof workbookPath !== "string") {
    return workbookPath;
  }

  const query = normalizeQuery(target?.query, context, workbookPath);
  if ("ok" in query) {
    return query;
  }

  const maxMatches = normalizeMaxMatches(target?.maxMatches, context, workbookPath);
  if (typeof maxMatches !== "number") {
    return maxMatches;
  }

  return {
    workbookPath,
    sheetName: target?.sheetName?.trim() || undefined,
    query,
    maxMatches,
    includeNearbyCells: target?.includeNearbyCells === true,
  };
}

export function planOfficeTablePosition(request: OfficeTablePositionRequest = {}): OfficeTablePositionResult {
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
    toolId: officeTablePositionDescriptor.toolId,
    output: {
      kind: "agentCore.basicTool.office.tablePosition",
      target,
      dryRun: true,
      executionBlocked: true,
      permissionsRequired: officeTablePositionDescriptor.permissionsRequired,
      unsafeSideEffects: false,
      resultEnvelope: {
        workbookPath: target.workbookPath,
        sheetName: target.sheetName,
        query: target.query,
        matches: [],
        truncated: false,
        metadata: {
          maxMatches: target.maxMatches,
          includeNearbyCells: target.includeNearbyCells,
        },
      },
    },
    audit: [
      auditEvent("agentCore.basicTool.office.tablePosition.dryRun", request.context, target.workbookPath, {
        sheetName: target.sheetName,
        queryKind: target.query.kind,
        maxMatches: target.maxMatches,
      }),
    ],
    events: ["basicTool.office.tablePosition.dryRun"],
  };
}
