/*
 * 文件定位：ToolabilityPool / TAP 高级工具系统 / Office 工具集合 / 文档工具。
 * 核心目的：提供 办公文档基础工具 / 文档工具 中的“检索文档”基础能力原语。
 * 能力要求1：需要定义该能力的输入、输出、错误、权限需求和可观测事件。
 * 能力要求2：这些 Office 能力由 TAP 高级工具系统承接，不再作为 baseTool 完成目标。
 * 能力要求3：TAP 负责 Office 能力的治理、审批、组合和专业能力库承接。
 * 边界：承接 Office 高级工具能力，不回写到 agentCore baseTools。
 * 对接：通过 TAP 复用转交与 runtime 官方模块桥接接通，并保留治理、审批和审计边界。
 * 实现提示：先补稳定类型契约、最小可测行为和清晰错误边界，再接入真实执行逻辑。
 */

import path from "node:path";

export type OfficeDocRipgrepBoundary = "input" | "scope" | "governance" | "permission" | "execution";

export type OfficeDocRipgrepPermission = "filesystem:read" | "office:read";

export type OfficeDocRipgrepGate = {
  accepted: boolean;
  reason?: string;
};

export type OfficeDocRipgrepContext = {
  toolCallId?: string;
  workspaceRoot?: string;
  dryRun?: boolean;
  requestedScopes?: readonly string[];
  allowedScopes?: readonly string[];
  allowedDocumentRoots?: readonly string[];
  grantedPermissions?: readonly OfficeDocRipgrepPermission[];
  governance?: OfficeDocRipgrepGate;
  auditMetadata?: Readonly<Record<string, unknown>>;
};

export type OfficeDocRipgrepRequest = {
  documentPath?: string;
  query?: string;
  fileGlob?: string;
  maxMatches?: number;
  literal?: boolean;
  caseSensitive?: boolean;
  context?: OfficeDocRipgrepContext;
  executor?: OfficeDocRipgrepExecutor;
};

export type OfficeDocRipgrepMatch = {
  documentPath: string;
  section?: string;
  line?: number;
  text: string;
};

export type OfficeDocRipgrepExecution = {
  exitCode: number;
  matches: readonly OfficeDocRipgrepMatch[];
  stderr?: string;
};

export type OfficeDocRipgrepExecutor = (request: {
  commandPreview: readonly string[];
  documentPath: string;
  query: string;
  maxMatches: number;
}) => OfficeDocRipgrepExecution | Promise<OfficeDocRipgrepExecution>;

export type OfficeDocRipgrepErrorCode =
  | "MISSING_DOCUMENT_PATH"
  | "MISSING_QUERY"
  | "NUL_BYTE_IN_PATH"
  | "ABSOLUTE_DOCUMENT_PATH"
  | "DOCUMENT_PATH_OUTSIDE_SCOPE"
  | "INVALID_MAX_MATCHES"
  | "SCOPE_DENIED"
  | "PERMISSION_DENIED"
  | "GOVERNANCE_REJECTED"
  | "EXECUTOR_NOT_INJECTED"
  | "EXECUTOR_REJECTED"
  | "DOCUMENT_RIPGREP_FAILED";

export type OfficeDocRipgrepError = {
  code: OfficeDocRipgrepErrorCode;
  message: string;
  boundary: OfficeDocRipgrepBoundary;
  publicSafe: true;
};

export type OfficeDocRipgrepAudit = {
  tool: "office.docRipgrep";
  toolCallId: string;
  documentPath?: string;
  workspaceRoot?: string;
  dryRun: boolean;
  requestedScopes: readonly string[];
  acceptedScopes: readonly string[];
  permissionsRequired: readonly OfficeDocRipgrepPermission[];
  unsafeSideEffects: false;
  metadata: Readonly<Record<string, unknown>>;
};

export type OfficeDocRipgrepPlan = {
  kind: "agentCore.basicTool.office.docRipgrep.plan";
  operation: "document-text-search";
  documentPath: string;
  query: string;
  fileGlob?: string;
  maxMatches: number;
  commandPreview: readonly string[];
  dispatch: "dry-run" | "injected-executor";
  readsFileDirectly: false;
};

export type OfficeDocRipgrepOutput = {
  kind: "agentCore.basicTool.office.docRipgrep.output";
  matches: readonly OfficeDocRipgrepMatch[];
  exitCode: number;
  stderr?: string;
  unsafeSideEffects: false;
};

export type OfficeDocRipgrepResult =
  | {
      ok: true;
      plan: OfficeDocRipgrepPlan;
      audit: OfficeDocRipgrepAudit;
      output?: OfficeDocRipgrepOutput;
      events: readonly string[];
    }
  | {
      ok: false;
      error: OfficeDocRipgrepError;
      audit: OfficeDocRipgrepAudit;
      events: readonly string[];
    };

export const officeDocRipgrepDescriptor = {
  tool: "office.docRipgrep",
  route: "toolabilityPool.officeBase.documentations",
  purpose: "plan a governed office-document text search without spawning ripgrep directly",
  permissionsRequired: ["filesystem:read", "office:read"],
  defaultDispatch: "dry-run",
  unsafeSideEffects: false,
  tapOwnsApproval: true,
} as const;

function isBlank(value: string | undefined): boolean {
  return typeof value !== "string" || value.trim().length === 0;
}

function cleanList(values: readonly string[] | undefined): readonly string[] {
  return [...new Set((values ?? []).map((value) => value.trim()).filter(Boolean))];
}

function dryRunEnabled(context: OfficeDocRipgrepContext | undefined): boolean {
  return context?.dryRun !== false;
}

function auditFor(
  context: OfficeDocRipgrepContext | undefined,
  documentPath: string | undefined,
  acceptedScopes: readonly string[] = [],
): OfficeDocRipgrepAudit {
  return {
    tool: "office.docRipgrep",
    toolCallId: context?.toolCallId?.trim() || "office.docRipgrep:dry-run",
    documentPath,
    workspaceRoot: context?.workspaceRoot?.trim() || undefined,
    dryRun: dryRunEnabled(context),
    requestedScopes: cleanList(context?.requestedScopes),
    acceptedScopes,
    permissionsRequired: officeDocRipgrepDescriptor.permissionsRequired,
    unsafeSideEffects: false,
    metadata: context?.auditMetadata ?? {},
  };
}

function failure(
  code: OfficeDocRipgrepErrorCode,
  message: string,
  boundary: OfficeDocRipgrepBoundary,
  context: OfficeDocRipgrepContext | undefined,
  documentPath?: string,
): OfficeDocRipgrepResult {
  return {
    ok: false,
    error: { code, message, boundary, publicSafe: true },
    audit: auditFor(context, documentPath),
    events: ["office.docRipgrep.rejected"],
  };
}

function normalizeDocumentPath(
  documentPath: string | undefined,
  context: OfficeDocRipgrepContext | undefined,
): string | OfficeDocRipgrepResult {
  const rawPath = documentPath?.trim() ?? "";
  if (isBlank(rawPath)) {
    return failure("MISSING_DOCUMENT_PATH", "office.docRipgrep requires documentPath", "input", context, documentPath);
  }

  if (rawPath.includes("\0")) {
    return failure("NUL_BYTE_IN_PATH", "office.docRipgrep documentPath cannot contain NUL bytes", "input", context);
  }

  const normalized = path.posix.normalize(rawPath.replaceAll("\\", "/"));
  if (path.posix.isAbsolute(normalized) || /^[A-Za-z]:\//.test(normalized)) {
    return failure(
      "ABSOLUTE_DOCUMENT_PATH",
      "office.docRipgrep only accepts workspace-relative documentPath",
      "scope",
      context,
      normalized,
    );
  }

  if (normalized === ".." || normalized.startsWith("../")) {
    return failure(
      "DOCUMENT_PATH_OUTSIDE_SCOPE",
      "office.docRipgrep documentPath must stay inside the workspace scope",
      "scope",
      context,
      normalized,
    );
  }

  const allowedRoots = cleanList(context?.allowedDocumentRoots).map((root) => path.posix.normalize(root.replaceAll("\\", "/")));
  if (allowedRoots.length > 0) {
    const inScope = allowedRoots.some((root) => root === "." || normalized === root || normalized.startsWith(`${root}/`));
    if (!inScope) {
      return failure(
        "DOCUMENT_PATH_OUTSIDE_SCOPE",
        "office.docRipgrep documentPath is outside allowed document roots",
        "scope",
        context,
        normalized,
      );
    }
  }

  return normalized === "." ? "." : normalized;
}

function resolveScopes(context: OfficeDocRipgrepContext | undefined): readonly string[] | OfficeDocRipgrepResult {
  const requested = cleanList(context?.requestedScopes);
  const allowed = cleanList(context?.allowedScopes);
  if (requested.length === 0) {
    return [];
  }

  const denied = requested.filter((scope) => !allowed.includes(scope));
  if (denied.length > 0) {
    return failure("SCOPE_DENIED", `office.docRipgrep scope ${denied[0]} is outside runtime governance`, "scope", context);
  }

  return requested;
}

function ensurePermissions(context: OfficeDocRipgrepContext | undefined, documentPath: string): OfficeDocRipgrepResult | undefined {
  const granted = cleanList(context?.grantedPermissions);
  if (granted.length === 0) {
    return undefined;
  }

  const missing = officeDocRipgrepDescriptor.permissionsRequired.filter((permission) => !granted.includes(permission));
  if (missing.length > 0) {
    return failure(
      "PERMISSION_DENIED",
      `office.docRipgrep is missing permissions: ${missing.join(", ")}`,
      "permission",
      context,
      documentPath,
    );
  }

  return undefined;
}

function normalizeMaxMatches(maxMatches: number | undefined, context: OfficeDocRipgrepContext | undefined): number | OfficeDocRipgrepResult {
  const resolved = maxMatches ?? 50;
  if (!Number.isInteger(resolved) || resolved < 1) {
    return failure("INVALID_MAX_MATCHES", "office.docRipgrep maxMatches must be a positive integer", "input", context);
  }

  return resolved;
}

function buildCommandPreview(request: {
  query: string;
  documentPath: string;
  fileGlob?: string;
  maxMatches: number;
  literal: boolean;
  caseSensitive: boolean;
}): readonly string[] {
  return [
    "office-doc-ripgrep",
    "--json",
    "--max-count",
    String(request.maxMatches),
    ...(request.literal ? ["--fixed-strings"] : []),
    ...(request.caseSensitive ? [] : ["--ignore-case"]),
    ...(request.fileGlob === undefined ? [] : ["--glob", request.fileGlob]),
    "--",
    request.query,
    request.documentPath,
  ];
}

export async function planOfficeDocRipgrep(request: OfficeDocRipgrepRequest = {}): Promise<OfficeDocRipgrepResult> {
  if (isBlank(request.query)) {
    return failure("MISSING_QUERY", "office.docRipgrep requires query", "input", request.context);
  }

  if (request.context?.governance?.accepted === false) {
    return failure(
      "GOVERNANCE_REJECTED",
      request.context.governance.reason ?? "office.docRipgrep was rejected by runtime governance",
      "governance",
      request.context,
    );
  }

  const documentPath = normalizeDocumentPath(request.documentPath, request.context);
  if (typeof documentPath !== "string") {
    return documentPath;
  }

  const maxMatches = normalizeMaxMatches(request.maxMatches, request.context);
  if (typeof maxMatches !== "number") {
    return maxMatches;
  }

  const acceptedScopes = resolveScopes(request.context);
  if ("ok" in acceptedScopes) {
    return acceptedScopes;
  }

  const permissionFailure = ensurePermissions(request.context, documentPath);
  if (permissionFailure !== undefined) {
    return permissionFailure;
  }

  const dispatch = dryRunEnabled(request.context) ? "dry-run" : "injected-executor";
  if (dispatch === "injected-executor" && request.executor === undefined) {
    return failure(
      "EXECUTOR_NOT_INJECTED",
      "office.docRipgrep requires an injected executor when dryRun is false",
      "execution",
      request.context,
      documentPath,
    );
  }

  const query = request.query?.trim() ?? "";
  const fileGlob = request.fileGlob?.trim() || undefined;
  const commandPreview = buildCommandPreview({
    query,
    documentPath,
    fileGlob,
    maxMatches,
    literal: request.literal ?? true,
    caseSensitive: request.caseSensitive ?? true,
  });
  const plan: OfficeDocRipgrepPlan = {
    kind: "agentCore.basicTool.office.docRipgrep.plan",
    operation: "document-text-search",
    documentPath,
    query,
    fileGlob,
    maxMatches,
    commandPreview,
    dispatch,
    readsFileDirectly: false,
  };
  const audit = auditFor(request.context, documentPath, acceptedScopes);

  if (dispatch === "dry-run") {
    return { ok: true, plan, audit, events: ["office.docRipgrep.planned"] };
  }

  try {
    const execution = await request.executor?.({ commandPreview, documentPath, query, maxMatches });
    if (execution === undefined) {
      return failure("EXECUTOR_REJECTED", "office.docRipgrep executor returned no envelope", "execution", request.context, documentPath);
    }

    if (execution.exitCode > 1) {
      return failure(
        "DOCUMENT_RIPGREP_FAILED",
        execution.stderr ?? `office.docRipgrep executor exited with code ${execution.exitCode}`,
        "execution",
        request.context,
        documentPath,
      );
    }

    return {
      ok: true,
      plan,
      audit,
      output: {
        kind: "agentCore.basicTool.office.docRipgrep.output",
        matches: execution.matches.slice(0, maxMatches),
        exitCode: execution.exitCode,
        stderr: execution.stderr,
        unsafeSideEffects: false,
      },
      events: ["office.docRipgrep.injectedExecutorCompleted"],
    };
  } catch (error) {
    return failure(
      "EXECUTOR_REJECTED",
      error instanceof Error ? error.message : "office.docRipgrep executor rejected the request",
      "execution",
      request.context,
      documentPath,
    );
  }
}
