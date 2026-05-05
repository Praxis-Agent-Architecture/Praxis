/*
 * 文件定位：ToolabilityPool / TAP 高级工具系统 / Office 工具集合 / 文档工具。
 * 核心目的：提供 办公文档基础工具 / 文档工具 中的“视觉检查文档”基础能力原语。
 * 能力要求1：需要定义该能力的输入、输出、错误、权限需求和可观测事件。
 * 能力要求2：这些 Office 能力由 TAP 高级工具系统承接，不再作为 baseTool 完成目标。
 * 能力要求3：TAP 负责 Office 能力的治理、审批、组合和专业能力库承接。
 * 边界：承接 Office 高级工具能力，不回写到 agentCore baseTools。
 * 对接：通过 TAP 复用转交与 runtime 官方模块桥接接通，并保留治理、审批和审计边界。
 * 实现提示：先补稳定类型契约、最小可测行为和清晰错误边界，再接入真实执行逻辑。
 */

import path from "node:path";

export type OfficeDocVisionCheckBoundary = "input" | "scope" | "governance" | "permission" | "execution";

export type OfficeDocVisionCheckPermission = "filesystem:read" | "office:read" | "vision:inspect";

export type OfficeDocVisionCheckGate = {
  accepted: boolean;
  reason?: string;
};

export type OfficeDocVisionCheckContext = {
  toolCallId?: string;
  workspaceRoot?: string;
  dryRun?: boolean;
  requestedScopes?: readonly string[];
  allowedScopes?: readonly string[];
  allowedDocumentRoots?: readonly string[];
  grantedPermissions?: readonly OfficeDocVisionCheckPermission[];
  governance?: OfficeDocVisionCheckGate;
  auditMetadata?: Readonly<Record<string, unknown>>;
};

export type OfficeDocVisionCheckRequest = {
  documentPath?: string;
  checks?: readonly string[];
  pages?: readonly number[];
  renderProfile?: string;
  context?: OfficeDocVisionCheckContext;
  inspector?: OfficeDocVisionCheckInspector;
};

export type OfficeDocVisionIssue = {
  page?: number;
  check: string;
  severity: "info" | "warning" | "error";
  message: string;
};

export type OfficeDocVisionInspection = {
  issues: readonly OfficeDocVisionIssue[];
  renderedPages: readonly number[];
  summary?: string;
};

export type OfficeDocVisionCheckInspector = (request: {
  documentPath: string;
  checks: readonly string[];
  pages: readonly number[];
  renderProfile: string;
}) => OfficeDocVisionInspection | Promise<OfficeDocVisionInspection>;

export type OfficeDocVisionCheckErrorCode =
  | "MISSING_DOCUMENT_PATH"
  | "NUL_BYTE_IN_PATH"
  | "ABSOLUTE_DOCUMENT_PATH"
  | "DOCUMENT_PATH_OUTSIDE_SCOPE"
  | "INVALID_PAGE_RANGE"
  | "MISSING_CHECKS"
  | "SCOPE_DENIED"
  | "PERMISSION_DENIED"
  | "GOVERNANCE_REJECTED"
  | "INSPECTOR_NOT_INJECTED"
  | "INSPECTOR_REJECTED";

export type OfficeDocVisionCheckError = {
  code: OfficeDocVisionCheckErrorCode;
  message: string;
  boundary: OfficeDocVisionCheckBoundary;
  publicSafe: true;
};

export type OfficeDocVisionCheckAudit = {
  tool: "office.docVisionCheck";
  toolCallId: string;
  documentPath?: string;
  workspaceRoot?: string;
  dryRun: boolean;
  requestedScopes: readonly string[];
  acceptedScopes: readonly string[];
  permissionsRequired: readonly OfficeDocVisionCheckPermission[];
  unsafeSideEffects: false;
  metadata: Readonly<Record<string, unknown>>;
};

export type OfficeDocVisionCheckPlan = {
  kind: "agentCore.basicTool.office.docVisionCheck.plan";
  operation: "document-vision-check";
  documentPath: string;
  checks: readonly string[];
  pages: readonly number[];
  renderProfile: string;
  dispatch: "dry-run" | "injected-inspector";
  readsFileDirectly: false;
  callsVisionProviderDirectly: false;
};

export type OfficeDocVisionCheckOutput = {
  kind: "agentCore.basicTool.office.docVisionCheck.output";
  issues: readonly OfficeDocVisionIssue[];
  renderedPages: readonly number[];
  summary?: string;
  unsafeSideEffects: false;
};

export type OfficeDocVisionCheckResult =
  | {
      ok: true;
      plan: OfficeDocVisionCheckPlan;
      audit: OfficeDocVisionCheckAudit;
      output?: OfficeDocVisionCheckOutput;
      events: readonly string[];
    }
  | {
      ok: false;
      error: OfficeDocVisionCheckError;
      audit: OfficeDocVisionCheckAudit;
      events: readonly string[];
    };

export const officeDocVisionCheckDescriptor = {
  tool: "office.docVisionCheck",
  route: "toolabilityPool.officeBase.documentations",
  purpose: "plan a governed visual inspection of an office document through an injected inspector envelope",
  permissionsRequired: ["filesystem:read", "office:read", "vision:inspect"],
  defaultDispatch: "dry-run",
  unsafeSideEffects: false,
  tapOwnsApproval: true,
} as const;

const defaultChecks = ["layout-integrity", "text-legibility", "image-presence"] as const;

function cleanList(values: readonly string[] | undefined): readonly string[] {
  return [...new Set((values ?? []).map((value) => value.trim()).filter(Boolean))];
}

function dryRunEnabled(context: OfficeDocVisionCheckContext | undefined): boolean {
  return context?.dryRun !== false;
}

function auditFor(
  context: OfficeDocVisionCheckContext | undefined,
  documentPath: string | undefined,
  acceptedScopes: readonly string[] = [],
): OfficeDocVisionCheckAudit {
  return {
    tool: "office.docVisionCheck",
    toolCallId: context?.toolCallId?.trim() || "office.docVisionCheck:dry-run",
    documentPath,
    workspaceRoot: context?.workspaceRoot?.trim() || undefined,
    dryRun: dryRunEnabled(context),
    requestedScopes: cleanList(context?.requestedScopes),
    acceptedScopes,
    permissionsRequired: officeDocVisionCheckDescriptor.permissionsRequired,
    unsafeSideEffects: false,
    metadata: context?.auditMetadata ?? {},
  };
}

function failure(
  code: OfficeDocVisionCheckErrorCode,
  message: string,
  boundary: OfficeDocVisionCheckBoundary,
  context: OfficeDocVisionCheckContext | undefined,
  documentPath?: string,
): OfficeDocVisionCheckResult {
  return {
    ok: false,
    error: { code, message, boundary, publicSafe: true },
    audit: auditFor(context, documentPath),
    events: ["office.docVisionCheck.rejected"],
  };
}

function normalizeDocumentPath(
  documentPath: string | undefined,
  context: OfficeDocVisionCheckContext | undefined,
): string | OfficeDocVisionCheckResult {
  const rawPath = documentPath?.trim() ?? "";
  if (rawPath.length === 0) {
    return failure("MISSING_DOCUMENT_PATH", "office.docVisionCheck requires documentPath", "input", context, documentPath);
  }

  if (rawPath.includes("\0")) {
    return failure("NUL_BYTE_IN_PATH", "office.docVisionCheck documentPath cannot contain NUL bytes", "input", context);
  }

  const normalized = path.posix.normalize(rawPath.replaceAll("\\", "/"));
  if (path.posix.isAbsolute(normalized) || /^[A-Za-z]:\//.test(normalized)) {
    return failure(
      "ABSOLUTE_DOCUMENT_PATH",
      "office.docVisionCheck only accepts workspace-relative documentPath",
      "scope",
      context,
      normalized,
    );
  }

  if (normalized === ".." || normalized.startsWith("../")) {
    return failure(
      "DOCUMENT_PATH_OUTSIDE_SCOPE",
      "office.docVisionCheck documentPath must stay inside workspace scope",
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
        "office.docVisionCheck documentPath is outside allowed document roots",
        "scope",
        context,
        normalized,
      );
    }
  }

  return normalized;
}

function normalizeChecks(checks: readonly string[] | undefined, context: OfficeDocVisionCheckContext | undefined): readonly string[] | OfficeDocVisionCheckResult {
  const resolved = cleanList(checks) as readonly string[];
  if (checks !== undefined && resolved.length === 0) {
    return failure("MISSING_CHECKS", "office.docVisionCheck checks cannot be empty when provided", "input", context);
  }

  return resolved.length === 0 ? defaultChecks : resolved;
}

function normalizePages(pages: readonly number[] | undefined, context: OfficeDocVisionCheckContext | undefined): readonly number[] | OfficeDocVisionCheckResult {
  const resolved = pages ?? [1];
  const invalid = resolved.some((page) => !Number.isInteger(page) || page < 1);
  if (invalid) {
    return failure("INVALID_PAGE_RANGE", "office.docVisionCheck pages must be positive page numbers", "input", context);
  }

  return [...new Set(resolved)];
}

function resolveScopes(context: OfficeDocVisionCheckContext | undefined): readonly string[] | OfficeDocVisionCheckResult {
  const requested = cleanList(context?.requestedScopes);
  const allowed = cleanList(context?.allowedScopes);
  if (requested.length === 0) {
    return [];
  }

  const denied = requested.filter((scope) => !allowed.includes(scope));
  if (denied.length > 0) {
    return failure("SCOPE_DENIED", `office.docVisionCheck scope ${denied[0]} is outside runtime governance`, "scope", context);
  }

  return requested;
}

function ensurePermissions(context: OfficeDocVisionCheckContext | undefined, documentPath: string): OfficeDocVisionCheckResult | undefined {
  const granted = cleanList(context?.grantedPermissions);
  if (granted.length === 0) {
    return undefined;
  }

  const missing = officeDocVisionCheckDescriptor.permissionsRequired.filter((permission) => !granted.includes(permission));
  if (missing.length > 0) {
    return failure(
      "PERMISSION_DENIED",
      `office.docVisionCheck is missing permissions: ${missing.join(", ")}`,
      "permission",
      context,
      documentPath,
    );
  }

  return undefined;
}

export async function planOfficeDocVisionCheck(request: OfficeDocVisionCheckRequest = {}): Promise<OfficeDocVisionCheckResult> {
  if (request.context?.governance?.accepted === false) {
    return failure(
      "GOVERNANCE_REJECTED",
      request.context.governance.reason ?? "office.docVisionCheck was rejected by runtime governance",
      "governance",
      request.context,
    );
  }

  const documentPath = normalizeDocumentPath(request.documentPath, request.context);
  if (typeof documentPath !== "string") {
    return documentPath;
  }

  const checks = normalizeChecks(request.checks, request.context);
  if ("ok" in checks) {
    return checks;
  }

  const pages = normalizePages(request.pages, request.context);
  if ("ok" in pages) {
    return pages;
  }

  const acceptedScopes = resolveScopes(request.context);
  if ("ok" in acceptedScopes) {
    return acceptedScopes;
  }

  const permissionFailure = ensurePermissions(request.context, documentPath);
  if (permissionFailure !== undefined) {
    return permissionFailure;
  }

  const dispatch = dryRunEnabled(request.context) ? "dry-run" : "injected-inspector";
  if (dispatch === "injected-inspector" && request.inspector === undefined) {
    return failure(
      "INSPECTOR_NOT_INJECTED",
      "office.docVisionCheck requires an injected inspector when dryRun is false",
      "execution",
      request.context,
      documentPath,
    );
  }

  const renderProfile = request.renderProfile?.trim() || "default-document-render";
  const plan: OfficeDocVisionCheckPlan = {
    kind: "agentCore.basicTool.office.docVisionCheck.plan",
    operation: "document-vision-check",
    documentPath,
    checks,
    pages,
    renderProfile,
    dispatch,
    readsFileDirectly: false,
    callsVisionProviderDirectly: false,
  };
  const audit = auditFor(request.context, documentPath, acceptedScopes);

  if (dispatch === "dry-run") {
    return { ok: true, plan, audit, events: ["office.docVisionCheck.planned"] };
  }

  try {
    const inspection = await request.inspector?.({ documentPath, checks, pages, renderProfile });
    if (inspection === undefined) {
      return failure("INSPECTOR_REJECTED", "office.docVisionCheck inspector returned no envelope", "execution", request.context, documentPath);
    }

    return {
      ok: true,
      plan,
      audit,
      output: {
        kind: "agentCore.basicTool.office.docVisionCheck.output",
        issues: inspection.issues,
        renderedPages: inspection.renderedPages,
        summary: inspection.summary,
        unsafeSideEffects: false,
      },
      events: ["office.docVisionCheck.injectedInspectorCompleted"],
    };
  } catch (error) {
    return failure(
      "INSPECTOR_REJECTED",
      error instanceof Error ? error.message : "office.docVisionCheck inspector rejected the request",
      "execution",
      request.context,
      documentPath,
    );
  }
}
