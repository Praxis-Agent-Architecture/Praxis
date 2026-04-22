/*
 * 文件定位：Agent 执行引擎 / 基础工具原语层 / 基础工具集合 / 办公文档基础工具 / 表格工具。
 * 核心目的：提供 办公文档基础工具 / 表格工具 中的“视觉检查表格”基础能力原语。
 * 能力要求1：需要定义该能力的输入、输出、错误、权限需求和可观测事件。
 * 能力要求2：这些基础工具是 Agent 成立的底层能力，不是 TAP 的最终高级工具库。
 * 能力要求3：后续 TAP 可以基于这些原语构建更强的工具编排、审批、替换和专业能力库。
 * 边界：保留 Agent 基础工具原语，不替代 TAP 的高级工具系统。
 * 对接：需要被 runtime.execEngine 拉起，并和 mainLoop、stateEngine、事件暴露、工具调用策略接通。
 * 实现提示：先补稳定类型契约、最小可测行为和清晰错误边界，再接入真实执行逻辑。
 */

export type OfficeTableVisionCheckPermission = "filesystem:read" | "office:read" | "vision:analyze";

export type OfficeTableVisionCheckErrorBoundary = "input" | "scope" | "permission" | "contract";

export type OfficeTableVisionCheckContext = {
  runtimeId?: string;
  invocationId?: string;
  dryRun?: boolean;
  allowedFileRoots?: readonly string[];
  grantedPermissions?: readonly OfficeTableVisionCheckPermission[];
  auditMetadata?: Readonly<Record<string, unknown>>;
};

export type OfficeTableVisionCheckKind = "layout" | "overflow" | "mergedCells" | "numberFormat" | "visualDiff";

export type OfficeTableVisionCheckTarget = {
  workbookPath: string;
  sheetName?: string;
  range?: string;
  checks: readonly OfficeTableVisionCheckKind[];
  referenceImagePath?: string;
  maxFindings: number;
};

export type OfficeTableVisionCheckRequest = {
  target?: {
    workbookPath?: string;
    sheetName?: string;
    range?: string;
    checks?: readonly OfficeTableVisionCheckKind[];
    referenceImagePath?: string;
    maxFindings?: number;
  };
  context?: OfficeTableVisionCheckContext;
};

export type OfficeTableVisionFinding = {
  check: OfficeTableVisionCheckKind;
  severity: "info" | "warning" | "error";
  address?: string;
  message: string;
};

export type OfficeTableVisionCheckEnvelope = {
  workbookPath: string;
  sheetName?: string;
  range?: string;
  findings: readonly OfficeTableVisionFinding[];
  truncated: false;
  metadata: {
    checks: readonly OfficeTableVisionCheckKind[];
    referenceImagePath?: string;
    maxFindings: number;
    requiresRenderedSnapshot: true;
    providerCallPlanned: false;
  };
};

export type OfficeTableVisionCheckErrorCode =
  | "MISSING_WORKBOOK_PATH"
  | "INVALID_RANGE"
  | "MISSING_CHECKS"
  | "INVALID_CHECK"
  | "MISSING_REFERENCE_IMAGE"
  | "INVALID_RESOURCE_LIMIT"
  | "SCOPE_REJECTED"
  | "PERMISSION_DENIED"
  | "REAL_EXECUTION_BLOCKED";

export type OfficeTableVisionCheckError = {
  code: OfficeTableVisionCheckErrorCode;
  message: string;
  boundary: OfficeTableVisionCheckErrorBoundary;
  publicSafe: true;
};

export type OfficeTableVisionCheckAuditEvent = {
  type: string;
  toolId: "office.tableVisionCheck";
  invocationId: string;
  dryRun: boolean;
  targetPath?: string;
  metadata: Readonly<Record<string, unknown>>;
};

export type OfficeTableVisionCheckOutput = {
  kind: "agentCore.basicTool.office.tableVisionCheck";
  target: OfficeTableVisionCheckTarget;
  dryRun: true;
  executionBlocked: true;
  permissionsRequired: readonly OfficeTableVisionCheckPermission[];
  unsafeSideEffects: false;
  resultEnvelope: OfficeTableVisionCheckEnvelope;
};

export type OfficeTableVisionCheckResult =
  | {
      ok: true;
      toolId: "office.tableVisionCheck";
      output: OfficeTableVisionCheckOutput;
      audit: readonly OfficeTableVisionCheckAuditEvent[];
      events: readonly string[];
    }
  | {
      ok: false;
      toolId: "office.tableVisionCheck";
      error: OfficeTableVisionCheckError;
      audit: readonly OfficeTableVisionCheckAuditEvent[];
      events: readonly string[];
    };

export const officeTableVisionCheckDescriptor = {
  toolId: "office.tableVisionCheck",
  capability: "vision-check-table",
  route: "agent_executionEngine.basic_toolLayer.baseTools.officeBase.spreadsheet",
  defaultDryRun: true,
  tapOwnsApproval: true,
  permissionsRequired: ["filesystem:read", "office:read", "vision:analyze"],
  unsafeSideEffects: false,
} as const;

const allowedChecks: readonly OfficeTableVisionCheckKind[] = [
  "layout",
  "overflow",
  "mergedCells",
  "numberFormat",
  "visualDiff",
];

function cleanList<T extends string>(values: readonly T[] | undefined): readonly T[] {
  return [...new Set((values ?? []).map((value) => value.trim()).filter(Boolean) as T[])];
}

function dryRunEnabled(context: OfficeTableVisionCheckContext | undefined): boolean {
  return context?.dryRun !== false;
}

function invocationId(context: OfficeTableVisionCheckContext | undefined): string {
  return context?.invocationId?.trim() || "office.tableVisionCheck:dry-run";
}

function auditEvent(
  type: string,
  context: OfficeTableVisionCheckContext | undefined,
  targetPath?: string,
  metadata?: Readonly<Record<string, unknown>>,
): OfficeTableVisionCheckAuditEvent {
  return {
    type,
    toolId: officeTableVisionCheckDescriptor.toolId,
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
  code: OfficeTableVisionCheckErrorCode,
  message: string,
  boundary: OfficeTableVisionCheckErrorBoundary,
  context: OfficeTableVisionCheckContext | undefined,
  targetPath?: string,
): OfficeTableVisionCheckResult {
  return {
    ok: false,
    toolId: officeTableVisionCheckDescriptor.toolId,
    error: { code, message, boundary, publicSafe: true },
    audit: [auditEvent("agentCore.basicTool.office.tableVisionCheck.rejected", context, targetPath, { code })],
    events: ["basicTool.office.tableVisionCheck.rejected"],
  };
}

function normalizePath(
  workbookPath: string | undefined,
  context: OfficeTableVisionCheckContext | undefined,
): string | OfficeTableVisionCheckResult {
  const normalized = workbookPath?.trim() ?? "";
  if (normalized.length === 0) {
    return failure("MISSING_WORKBOOK_PATH", "office.tableVisionCheck requires target.workbookPath", "input", context);
  }

  return normalized;
}

function normalizeRoot(root: string): string {
  const trimmed = root.trim();
  return trimmed === "/" ? trimmed : trimmed.replace(/\/+$/, "");
}

function ensurePathInScope(pathValue: string, context: OfficeTableVisionCheckContext | undefined): boolean {
  const allowedRoots = cleanList(context?.allowedFileRoots).map(normalizeRoot);
  if (allowedRoots.length === 0) {
    return true;
  }

  return allowedRoots.some((root) => pathValue === root || pathValue.startsWith(`${root}/`));
}

function ensureScope(
  target: Pick<OfficeTableVisionCheckTarget, "workbookPath" | "referenceImagePath">,
  context: OfficeTableVisionCheckContext | undefined,
): OfficeTableVisionCheckResult | undefined {
  if (!ensurePathInScope(target.workbookPath, context)) {
    return failure(
      "SCOPE_REJECTED",
      "office.tableVisionCheck target workbook is outside the allowed file roots",
      "scope",
      context,
      target.workbookPath,
    );
  }

  if (target.referenceImagePath !== undefined && !ensurePathInScope(target.referenceImagePath, context)) {
    return failure(
      "SCOPE_REJECTED",
      "office.tableVisionCheck reference image is outside the allowed file roots",
      "scope",
      context,
      target.referenceImagePath,
    );
  }

  return undefined;
}

function ensurePermissions(
  workbookPath: string,
  context: OfficeTableVisionCheckContext | undefined,
): OfficeTableVisionCheckResult | undefined {
  const granted = cleanList(context?.grantedPermissions);
  if (granted.length === 0) {
    return undefined;
  }

  const missing = officeTableVisionCheckDescriptor.permissionsRequired.filter((permission) => !granted.includes(permission));
  if (missing.length === 0) {
    return undefined;
  }

  return failure(
    "PERMISSION_DENIED",
    `office.tableVisionCheck is missing permissions: ${missing.join(", ")}`,
    "permission",
    context,
    workbookPath,
  );
}

function ensureDryRunOnly(
  workbookPath: string,
  context: OfficeTableVisionCheckContext | undefined,
): OfficeTableVisionCheckResult | undefined {
  if (dryRunEnabled(context)) {
    return undefined;
  }

  return failure(
    "REAL_EXECUTION_BLOCKED",
    "office.tableVisionCheck only returns a guarded dry-run vision check plan in the first implementation",
    "contract",
    context,
    workbookPath,
  );
}

function normalizeRange(
  range: string | undefined,
  context: OfficeTableVisionCheckContext | undefined,
  workbookPath: string,
): string | undefined | OfficeTableVisionCheckResult {
  const normalized = range?.trim();
  if (normalized === undefined || normalized.length === 0) {
    return undefined;
  }

  if (/^[A-Za-z]{1,3}[1-9]\d*(?::[A-Za-z]{1,3}[1-9]\d*)?$/.test(normalized)) {
    return normalized.toUpperCase();
  }

  return failure(
    "INVALID_RANGE",
    "office.tableVisionCheck target.range must be an A1 cell or A1 range",
    "input",
    context,
    workbookPath,
  );
}

function normalizeChecks(
  checks: readonly OfficeTableVisionCheckKind[] | undefined,
  referenceImagePath: string | undefined,
  context: OfficeTableVisionCheckContext | undefined,
  workbookPath: string,
): readonly OfficeTableVisionCheckKind[] | OfficeTableVisionCheckResult {
  if (checks === undefined || checks.length === 0) {
    return failure("MISSING_CHECKS", "office.tableVisionCheck requires at least one target check", "input", context, workbookPath);
  }

  const normalized = cleanList(checks);
  for (const check of normalized) {
    if (!allowedChecks.includes(check)) {
      return failure("INVALID_CHECK", "office.tableVisionCheck target.checks contains an unsupported check", "input", context, workbookPath);
    }
  }

  if (normalized.includes("visualDiff") && referenceImagePath === undefined) {
    return failure(
      "MISSING_REFERENCE_IMAGE",
      "office.tableVisionCheck visualDiff requires target.referenceImagePath",
      "input",
      context,
      workbookPath,
    );
  }

  return normalized;
}

function normalizeMaxFindings(
  maxFindings: number | undefined,
  context: OfficeTableVisionCheckContext | undefined,
  workbookPath: string,
): number | OfficeTableVisionCheckResult {
  if (maxFindings === undefined) {
    return 50;
  }

  if (Number.isInteger(maxFindings) && maxFindings > 0 && maxFindings <= 1000) {
    return maxFindings;
  }

  return failure(
    "INVALID_RESOURCE_LIMIT",
    "office.tableVisionCheck target.maxFindings must be a positive integer no greater than 1000",
    "input",
    context,
    workbookPath,
  );
}

function normalizeTarget(
  target: OfficeTableVisionCheckRequest["target"] | undefined,
  context: OfficeTableVisionCheckContext | undefined,
): OfficeTableVisionCheckTarget | OfficeTableVisionCheckResult {
  const workbookPath = normalizePath(target?.workbookPath, context);
  if (typeof workbookPath !== "string") {
    return workbookPath;
  }

  const range = normalizeRange(target?.range, context, workbookPath);
  if (range !== undefined && typeof range !== "string") {
    return range;
  }

  const referenceImagePath = target?.referenceImagePath?.trim() || undefined;
  const checks = normalizeChecks(target?.checks, referenceImagePath, context, workbookPath);
  if ("ok" in checks) {
    return checks;
  }

  const maxFindings = normalizeMaxFindings(target?.maxFindings, context, workbookPath);
  if (typeof maxFindings !== "number") {
    return maxFindings;
  }

  return {
    workbookPath,
    sheetName: target?.sheetName?.trim() || undefined,
    range,
    checks,
    referenceImagePath,
    maxFindings,
  };
}

export function planOfficeTableVisionCheck(request: OfficeTableVisionCheckRequest = {}): OfficeTableVisionCheckResult {
  const target = normalizeTarget(request.target, request.context);
  if ("ok" in target) {
    return target;
  }

  const scopeFailure = ensureScope(target, request.context);
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
    toolId: officeTableVisionCheckDescriptor.toolId,
    output: {
      kind: "agentCore.basicTool.office.tableVisionCheck",
      target,
      dryRun: true,
      executionBlocked: true,
      permissionsRequired: officeTableVisionCheckDescriptor.permissionsRequired,
      unsafeSideEffects: false,
      resultEnvelope: {
        workbookPath: target.workbookPath,
        sheetName: target.sheetName,
        range: target.range,
        findings: [],
        truncated: false,
        metadata: {
          checks: target.checks,
          referenceImagePath: target.referenceImagePath,
          maxFindings: target.maxFindings,
          requiresRenderedSnapshot: true,
          providerCallPlanned: false,
        },
      },
    },
    audit: [
      auditEvent("agentCore.basicTool.office.tableVisionCheck.dryRun", request.context, target.workbookPath, {
        sheetName: target.sheetName,
        range: target.range,
        checks: target.checks,
        referenceImagePath: target.referenceImagePath,
      }),
    ],
    events: ["basicTool.office.tableVisionCheck.dryRun"],
  };
}
