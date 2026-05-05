/*
 * 文件定位：ToolabilityPool / TAP 高级工具系统 / Office 工具集合 / 演示文稿工具。
 * 核心目的：提供 办公文档基础工具 / 演示文稿工具 中的“检索演示文稿”基础能力原语。
 * 能力要求1：需要定义该能力的输入、输出、错误、权限需求和可观测事件。
 * 能力要求2：这些 Office 能力由 TAP 高级工具系统承接，不再作为 baseTool 完成目标。
 * 能力要求3：TAP 负责 Office 能力的治理、审批、组合和专业能力库承接。
 * 边界：承接 Office 高级工具能力，不回写到 agentCore baseTools。
 * 对接：通过 TAP 复用转交与 runtime 官方模块桥接接通，并保留治理、审批和审计边界。
 * 实现提示：先补稳定类型契约、最小可测行为和清晰错误边界，再接入真实执行逻辑。
 */

export type OfficeSlidesRipgrepPermission = "filesystem:read" | "office:slides:read";

export type OfficeSlidesRipgrepErrorBoundary = "input" | "scope" | "permission" | "contract";

export type OfficeSlidesRipgrepContext = {
  runtimeId?: string;
  invocationId?: string;
  dryRun?: boolean;
  allowedPresentationRoots?: readonly string[];
  grantedPermissions?: readonly OfficeSlidesRipgrepPermission[];
  auditMetadata?: Readonly<Record<string, unknown>>;
};

export type OfficeSlidesRipgrepTarget = {
  presentationPath: string;
  query: string;
  matchCase: boolean;
  includeSpeakerNotes: boolean;
  maxMatches: number;
};

export type OfficeSlidesRipgrepRequest = {
  target?: Partial<OfficeSlidesRipgrepTarget>;
  context?: OfficeSlidesRipgrepContext;
};

export type OfficeSlidesRipgrepErrorCode =
  | "MISSING_PRESENTATION_PATH"
  | "MISSING_QUERY"
  | "INVALID_MAX_MATCHES"
  | "SCOPE_REJECTED"
  | "PERMISSION_DENIED"
  | "REAL_EXECUTION_BLOCKED";

export type OfficeSlidesRipgrepError = {
  code: OfficeSlidesRipgrepErrorCode;
  message: string;
  boundary: OfficeSlidesRipgrepErrorBoundary;
  publicSafe: true;
};

export type OfficeSlidesRipgrepAuditEvent = {
  type: string;
  toolId: "office.slidesRipgrep";
  invocationId: string;
  dryRun: boolean;
  presentationPath?: string;
  metadata: Readonly<Record<string, unknown>>;
};

export type OfficeSlidesRipgrepOutput = {
  kind: "agentCore.basicTool.office.slidesRipgrep";
  target: OfficeSlidesRipgrepTarget;
  actionPreview: readonly string[];
  dryRun: true;
  executionBlocked: true;
  permissionsRequired: readonly OfficeSlidesRipgrepPermission[];
  unsafeSideEffects: false;
  resultEnvelope: {
    matches: readonly {
      slideNumber: number;
      field: "title" | "body" | "speaker-notes" | "alt-text";
      snippet: string;
    }[];
    metadata: Readonly<Record<string, unknown>>;
  };
};

export type OfficeSlidesRipgrepResult =
  | {
      ok: true;
      toolId: "office.slidesRipgrep";
      output: OfficeSlidesRipgrepOutput;
      audit: readonly OfficeSlidesRipgrepAuditEvent[];
      events: readonly string[];
    }
  | {
      ok: false;
      toolId: "office.slidesRipgrep";
      error: OfficeSlidesRipgrepError;
      audit: readonly OfficeSlidesRipgrepAuditEvent[];
      events: readonly string[];
    };

export const officeSlidesRipgrepDescriptor = {
  toolId: "office.slidesRipgrep",
  capability: "search-presentation-text",
  route: "toolabilityPool.officeBase.presentations",
  defaultDryRun: true,
  tapOwnsApproval: true,
  unsafeSideEffects: false,
  permissionsRequired: ["filesystem:read", "office:slides:read"],
} as const;

function cleanList<T extends string>(values: readonly T[] | undefined): readonly T[] {
  return [...new Set((values ?? []).map((value) => value.trim()).filter(Boolean) as T[])];
}

function dryRunEnabled(context: OfficeSlidesRipgrepContext | undefined): boolean {
  return context?.dryRun !== false;
}

function invocationId(context: OfficeSlidesRipgrepContext | undefined): string {
  return context?.invocationId?.trim() || "office.slidesRipgrep:dry-run";
}

function normalizeRoot(root: string): string {
  const trimmed = root.trim();
  return trimmed === "/" ? trimmed : trimmed.replace(/\/+$/, "");
}

function hasPathTraversal(presentationPath: string): boolean {
  return presentationPath.split(/[\\/]+/).some((segment) => segment === "..");
}

function auditEvent(
  type: string,
  context: OfficeSlidesRipgrepContext | undefined,
  presentationPath?: string,
  metadata?: Readonly<Record<string, unknown>>,
): OfficeSlidesRipgrepAuditEvent {
  return {
    type,
    toolId: officeSlidesRipgrepDescriptor.toolId,
    invocationId: invocationId(context),
    dryRun: dryRunEnabled(context),
    presentationPath,
    metadata: {
      ...(context?.auditMetadata ?? {}),
      ...(metadata ?? {}),
    },
  };
}

function failure(
  code: OfficeSlidesRipgrepErrorCode,
  message: string,
  boundary: OfficeSlidesRipgrepErrorBoundary,
  context: OfficeSlidesRipgrepContext | undefined,
  presentationPath?: string,
): OfficeSlidesRipgrepResult {
  return {
    ok: false,
    toolId: officeSlidesRipgrepDescriptor.toolId,
    error: { code, message, boundary, publicSafe: true },
    audit: [auditEvent("agentCore.basicTool.office.slidesRipgrep.rejected", context, presentationPath, { code })],
    events: ["basicTool.office.slidesRipgrep.rejected"],
  };
}

function normalizePresentationPath(
  presentationPath: string | undefined,
  context: OfficeSlidesRipgrepContext | undefined,
): string | OfficeSlidesRipgrepResult {
  const normalized = presentationPath?.trim() ?? "";
  if (normalized.length === 0) {
    return failure(
      "MISSING_PRESENTATION_PATH",
      "office.slidesRipgrep requires target.presentationPath",
      "input",
      context,
      presentationPath,
    );
  }

  if (hasPathTraversal(normalized)) {
    return failure(
      "SCOPE_REJECTED",
      "office.slidesRipgrep target.presentationPath must not escape its presentation scope",
      "scope",
      context,
      normalized,
    );
  }

  return normalized;
}

function normalizeQuery(
  query: string | undefined,
  context: OfficeSlidesRipgrepContext | undefined,
  presentationPath: string,
): string | OfficeSlidesRipgrepResult {
  const normalized = query?.trim() ?? "";
  if (normalized.length === 0) {
    return failure("MISSING_QUERY", "office.slidesRipgrep requires target.query", "input", context, presentationPath);
  }

  return normalized;
}

function normalizeMaxMatches(
  maxMatches: number | undefined,
  context: OfficeSlidesRipgrepContext | undefined,
  presentationPath: string,
): number | OfficeSlidesRipgrepResult {
  if (maxMatches === undefined) {
    return 50;
  }

  if (Number.isInteger(maxMatches) && maxMatches > 0) {
    return maxMatches;
  }

  return failure(
    "INVALID_MAX_MATCHES",
    "office.slidesRipgrep target.maxMatches must be a positive integer",
    "input",
    context,
    presentationPath,
  );
}

function normalizeTarget(
  target: Partial<OfficeSlidesRipgrepTarget> | undefined,
  context: OfficeSlidesRipgrepContext | undefined,
): OfficeSlidesRipgrepTarget | OfficeSlidesRipgrepResult {
  const presentationPath = normalizePresentationPath(target?.presentationPath, context);
  if (typeof presentationPath !== "string") {
    return presentationPath;
  }

  const query = normalizeQuery(target?.query, context, presentationPath);
  if (typeof query !== "string") {
    return query;
  }

  const maxMatches = normalizeMaxMatches(target?.maxMatches, context, presentationPath);
  if (typeof maxMatches !== "number") {
    return maxMatches;
  }

  return {
    presentationPath,
    query,
    matchCase: target?.matchCase === true,
    includeSpeakerNotes: target?.includeSpeakerNotes === true,
    maxMatches,
  };
}

function ensureScope(
  target: OfficeSlidesRipgrepTarget,
  context: OfficeSlidesRipgrepContext | undefined,
): OfficeSlidesRipgrepResult | undefined {
  const allowedRoots = cleanList(context?.allowedPresentationRoots).map(normalizeRoot);
  if (allowedRoots.length === 0) {
    return undefined;
  }

  const allowed = allowedRoots.some(
    (root) => target.presentationPath === root || target.presentationPath.startsWith(`${root}/`),
  );
  if (allowed) {
    return undefined;
  }

  return failure(
    "SCOPE_REJECTED",
    "office.slidesRipgrep target presentation is outside the allowed presentation roots",
    "scope",
    context,
    target.presentationPath,
  );
}

function ensurePermissions(
  target: OfficeSlidesRipgrepTarget,
  context: OfficeSlidesRipgrepContext | undefined,
): OfficeSlidesRipgrepResult | undefined {
  const granted = cleanList(context?.grantedPermissions);
  if (granted.length === 0) {
    return undefined;
  }

  const missing = officeSlidesRipgrepDescriptor.permissionsRequired.filter((permission) => !granted.includes(permission));
  if (missing.length === 0) {
    return undefined;
  }

  return failure(
    "PERMISSION_DENIED",
    `office.slidesRipgrep is missing permissions: ${missing.join(", ")}`,
    "permission",
    context,
    target.presentationPath,
  );
}

function blockRealExecution(
  target: OfficeSlidesRipgrepTarget,
  context: OfficeSlidesRipgrepContext | undefined,
): OfficeSlidesRipgrepResult | undefined {
  if (dryRunEnabled(context)) {
    return undefined;
  }

  return failure(
    "REAL_EXECUTION_BLOCKED",
    "office.slidesRipgrep only returns a guarded dry-run plan in the first implementation",
    "contract",
    context,
    target.presentationPath,
  );
}

function actionPreview(target: OfficeSlidesRipgrepTarget): readonly string[] {
  return [
    "office.slidesRipgrep",
    "--input",
    target.presentationPath,
    "--query",
    target.query,
    target.matchCase ? "--case-sensitive" : "--ignore-case",
    target.includeSpeakerNotes ? "--include-speaker-notes" : "--slide-text-only",
    "--max-matches",
    String(target.maxMatches),
  ];
}

export function planOfficeSlidesRipgrep(request: OfficeSlidesRipgrepRequest = {}): OfficeSlidesRipgrepResult {
  const target = normalizeTarget(request.target, request.context);
  if ("ok" in target) {
    return target;
  }

  const scopeFailure = ensureScope(target, request.context);
  if (scopeFailure !== undefined) {
    return scopeFailure;
  }

  const permissionFailure = ensurePermissions(target, request.context);
  if (permissionFailure !== undefined) {
    return permissionFailure;
  }

  const realExecutionFailure = blockRealExecution(target, request.context);
  if (realExecutionFailure !== undefined) {
    return realExecutionFailure;
  }

  return {
    ok: true,
    toolId: officeSlidesRipgrepDescriptor.toolId,
    output: {
      kind: "agentCore.basicTool.office.slidesRipgrep",
      target,
      actionPreview: actionPreview(target),
      dryRun: true,
      executionBlocked: true,
      permissionsRequired: officeSlidesRipgrepDescriptor.permissionsRequired,
      unsafeSideEffects: false,
      resultEnvelope: {
        matches: [],
        metadata: {
          search: "not-executed",
          formatFamily: "presentation",
        },
      },
    },
    audit: [
      auditEvent("agentCore.basicTool.office.slidesRipgrep.dryRun", request.context, target.presentationPath, {
        matchCase: target.matchCase,
        includeSpeakerNotes: target.includeSpeakerNotes,
        maxMatches: target.maxMatches,
      }),
    ],
    events: ["basicTool.office.slidesRipgrep.dryRun"],
  };
}
