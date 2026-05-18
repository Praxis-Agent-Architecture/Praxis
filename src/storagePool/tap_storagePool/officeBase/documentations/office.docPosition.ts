/*
 * 文件定位：ToolabilityPool / TAP 高级工具系统 / Office 工具集合 / 文档工具。
 * 核心目的：提供 办公文档基础工具 / 文档工具 中的“定位文档内容”基础能力原语。
 * 能力要求1：需要定义该能力的输入、输出、错误、权限需求和可观测事件。
 * 能力要求2：这些 Office 能力由 TAP 高级工具系统承接，不再作为 baseTool 完成目标。
 * 能力要求3：TAP 负责 Office 能力的治理、审批、组合和专业能力库承接。
 * 边界：承接 Office 高级工具能力，不回写到 agentCore baseTools。
 * 对接：通过 TAP 复用转交与 runtime 官方模块桥接接通，并保留治理、审批和审计边界。
 * 实现提示：先补稳定类型契约、最小可测行为和清晰错误边界，再接入真实执行逻辑。
 */

export type OfficeDocPositionPermission = "filesystem:read" | "office:document:read";

export type OfficeDocPositionErrorBoundary = "input" | "scope" | "permission" | "contract";

export type OfficeDocPositionContext = {
  runtimeId?: string;
  invocationId?: string;
  dryRun?: boolean;
  allowedDocumentRoots?: readonly string[];
  grantedPermissions?: readonly OfficeDocPositionPermission[];
  auditMetadata?: Readonly<Record<string, unknown>>;
};

export type OfficeDocPositionQueryKind = "text" | "regex" | "heading" | "bookmark";

export type OfficeDocPositionQuery = {
  kind: OfficeDocPositionQueryKind;
  value: string;
  caseSensitive?: boolean;
};

export type OfficeDocPositionTarget = {
  documentPath: string;
  query: OfficeDocPositionQuery;
  maxMatches?: number;
};

export type OfficeDocPositionRequest = {
  target?: Partial<Omit<OfficeDocPositionTarget, "query">> & {
    query?: Partial<OfficeDocPositionQuery>;
  };
  context?: OfficeDocPositionContext;
};

export type OfficeDocPositionErrorCode =
  | "MISSING_DOCUMENT_PATH"
  | "UNSAFE_DOCUMENT_PATH"
  | "DOCUMENT_PATH_OUTSIDE_SCOPE"
  | "MISSING_QUERY"
  | "INVALID_QUERY_KIND"
  | "INVALID_REGEX_QUERY"
  | "INVALID_MAX_MATCHES"
  | "PERMISSION_DENIED"
  | "REAL_EXECUTION_BLOCKED";

export type OfficeDocPositionError = {
  code: OfficeDocPositionErrorCode;
  message: string;
  boundary: OfficeDocPositionErrorBoundary;
  publicSafe: true;
};

export type OfficeDocPositionAuditEvent = {
  type: string;
  toolId: "office.docPosition";
  invocationId: string;
  dryRun: boolean;
  documentPath?: string;
  metadata: Readonly<Record<string, unknown>>;
};

export type OfficeDocPositionMatch = {
  locator: string;
  excerpt: string;
  confidence: number;
};

export type OfficeDocPositionOutput = {
  kind: "agentCore.basicTool.office.docPosition";
  target: {
    documentPath: string;
    query: Required<OfficeDocPositionQuery>;
    maxMatches: number;
  };
  dryRun: true;
  executionBlocked: true;
  unsafeSideEffects: false;
  permissionsRequired: readonly OfficeDocPositionPermission[];
  locatorPlan: {
    parser: "office-document-positioner-v1";
    wouldScanDocument: true;
    matches: readonly OfficeDocPositionMatch[];
  };
};

export type OfficeDocPositionResult =
  | {
      ok: true;
      toolId: "office.docPosition";
      output: OfficeDocPositionOutput;
      audit: readonly OfficeDocPositionAuditEvent[];
      events: readonly string[];
    }
  | {
      ok: false;
      toolId: "office.docPosition";
      error: OfficeDocPositionError;
      audit: readonly OfficeDocPositionAuditEvent[];
      events: readonly string[];
    };

export const officeDocPositionDescriptor = {
  toolId: "office.docPosition",
  capability: "position-document-content",
  route: "toolabilityPool.officeBase.documentations",
  defaultDryRun: true,
  unsafeSideEffects: false,
  tapOwnsApproval: true,
  permissionsRequired: ["filesystem:read", "office:document:read"],
  defaultMaxMatches: 20,
} as const;

function cleanList<T extends string>(values: readonly T[] | undefined): readonly T[] {
  return [...new Set((values ?? []).map((value) => value.trim()).filter(Boolean) as T[])];
}

function dryRunEnabled(context: OfficeDocPositionContext | undefined): boolean {
  return context?.dryRun !== false;
}

function invocationId(context: OfficeDocPositionContext | undefined): string {
  return context?.invocationId?.trim() || "office.docPosition:dry-run";
}

function auditEvent(
  type: string,
  context: OfficeDocPositionContext | undefined,
  documentPath?: string,
  metadata?: Readonly<Record<string, unknown>>,
): OfficeDocPositionAuditEvent {
  return {
    type,
    toolId: officeDocPositionDescriptor.toolId,
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
  code: OfficeDocPositionErrorCode,
  message: string,
  boundary: OfficeDocPositionErrorBoundary,
  context: OfficeDocPositionContext | undefined,
  documentPath?: string,
): OfficeDocPositionResult {
  return {
    ok: false,
    toolId: officeDocPositionDescriptor.toolId,
    error: { code, message, boundary, publicSafe: true },
    audit: [auditEvent("agentCore.basicTool.office.docPosition.rejected", context, documentPath, { code })],
    events: ["basicTool.office.docPosition.rejected"],
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
  context: OfficeDocPositionContext | undefined,
): string | OfficeDocPositionResult {
  const normalized = documentPath?.trim() ?? "";
  if (normalized.length === 0) {
    return failure(
      "MISSING_DOCUMENT_PATH",
      "office.docPosition requires target.documentPath",
      "input",
      context,
      documentPath,
    );
  }

  if (hasUnsafePathSegments(normalized)) {
    return failure(
      "UNSAFE_DOCUMENT_PATH",
      "office.docPosition target.documentPath must not contain traversal or NUL segments",
      "scope",
      context,
      normalized,
    );
  }

  return normalized;
}

function ensureScope(documentPath: string, context: OfficeDocPositionContext | undefined): OfficeDocPositionResult | undefined {
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
    "office.docPosition target document is outside the allowed document roots",
    "scope",
    context,
    documentPath,
  );
}

function ensurePermissions(documentPath: string, context: OfficeDocPositionContext | undefined): OfficeDocPositionResult | undefined {
  const granted = cleanList(context?.grantedPermissions);
  if (granted.length === 0) {
    return undefined;
  }

  const missing = officeDocPositionDescriptor.permissionsRequired.filter((permission) => !granted.includes(permission));
  if (missing.length === 0) {
    return undefined;
  }

  return failure(
    "PERMISSION_DENIED",
    `office.docPosition is missing permissions: ${missing.join(", ")}`,
    "permission",
    context,
    documentPath,
  );
}

function ensureDryRunOnly(documentPath: string, context: OfficeDocPositionContext | undefined): OfficeDocPositionResult | undefined {
  if (dryRunEnabled(context)) {
    return undefined;
  }

  return failure(
    "REAL_EXECUTION_BLOCKED",
    "office.docPosition only returns a guarded dry-run plan in the first implementation",
    "contract",
    context,
    documentPath,
  );
}

function normalizeQuery(
  query: Partial<OfficeDocPositionQuery> | undefined,
  context: OfficeDocPositionContext | undefined,
  documentPath: string,
): Required<OfficeDocPositionQuery> | OfficeDocPositionResult {
  const value = query?.value?.trim() ?? "";
  if (value.length === 0) {
    return failure("MISSING_QUERY", "office.docPosition requires target.query.value", "input", context, documentPath);
  }

  const kind = query?.kind ?? "text";
  if (kind !== "text" && kind !== "regex" && kind !== "heading" && kind !== "bookmark") {
    return failure(
      "INVALID_QUERY_KIND",
      "office.docPosition target.query.kind must be text, regex, heading, or bookmark",
      "input",
      context,
      documentPath,
    );
  }

  if (kind === "regex") {
    try {
      new RegExp(value);
    } catch {
      return failure("INVALID_REGEX_QUERY", "office.docPosition target.query.value is not a valid regex", "input", context, documentPath);
    }
  }

  return {
    kind,
    value,
    caseSensitive: query?.caseSensitive === true,
  };
}

function normalizeMaxMatches(
  maxMatches: number | undefined,
  context: OfficeDocPositionContext | undefined,
  documentPath: string,
): number | OfficeDocPositionResult {
  if (maxMatches === undefined) {
    return officeDocPositionDescriptor.defaultMaxMatches;
  }

  if (!Number.isInteger(maxMatches) || maxMatches <= 0 || maxMatches > 500) {
    return failure(
      "INVALID_MAX_MATCHES",
      "office.docPosition target.maxMatches must be a positive integer up to 500",
      "input",
      context,
      documentPath,
    );
  }

  return maxMatches;
}

function normalizeTarget(
  target: OfficeDocPositionRequest["target"],
  context: OfficeDocPositionContext | undefined,
): OfficeDocPositionOutput["target"] | OfficeDocPositionResult {
  const documentPath = normalizeDocumentPath(target?.documentPath, context);
  if (typeof documentPath !== "string") {
    return documentPath;
  }

  const query = normalizeQuery(target?.query, context, documentPath);
  if ("ok" in query) {
    return query;
  }

  const maxMatches = normalizeMaxMatches(target?.maxMatches, context, documentPath);
  if (typeof maxMatches !== "number") {
    return maxMatches;
  }

  return {
    documentPath,
    query,
    maxMatches,
  };
}

export function planOfficeDocPosition(request: OfficeDocPositionRequest = {}): OfficeDocPositionResult {
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
    toolId: officeDocPositionDescriptor.toolId,
    output: {
      kind: "agentCore.basicTool.office.docPosition",
      target,
      dryRun: true,
      executionBlocked: true,
      unsafeSideEffects: false,
      permissionsRequired: officeDocPositionDescriptor.permissionsRequired,
      locatorPlan: {
        parser: "office-document-positioner-v1",
        wouldScanDocument: true,
        matches: [],
      },
    },
    audit: [
      auditEvent("agentCore.basicTool.office.docPosition.dryRun", request.context, target.documentPath, {
        queryKind: target.query.kind,
        maxMatches: target.maxMatches,
      }),
    ],
    events: ["basicTool.office.docPosition.dryRun"],
  };
}
