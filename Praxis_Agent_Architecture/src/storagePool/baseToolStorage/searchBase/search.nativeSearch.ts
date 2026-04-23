/*
 * 文件定位：Agent 执行引擎 / 基础工具原语层 / 基础工具集合 / 搜索基础工具。
 * 核心目的：提供 基础工具集合 / 搜索基础工具 中的“执行本地搜索”基础能力原语。
 * 能力要求1：需要定义该能力的输入、输出、错误、权限需求和可观测事件。
 * 能力要求2：这些基础工具是 Agent 成立的底层能力，不是 TAP 的最终高级工具库。
 * 能力要求3：后续 TAP 可以基于这些原语构建更强的工具编排、审批、替换和专业能力库。
 * 边界：保留 Agent 基础工具原语，不替代 TAP 的高级工具系统。
 * 对接：需要被 runtime.execEngine 拉起，并和 mainLoop、stateEngine、事件暴露、工具调用策略接通。
 * 实现提示：先补稳定类型契约、最小可测行为和清晰错误边界，再接入真实执行逻辑。
 */

export type NativeSearchPermission = "filesystem:read" | "search:native";

export type NativeSearchErrorBoundary = "input" | "scope" | "permission" | "contract" | "resource";

export type NativeSearchContext = {
  runtimeId?: string;
  invocationId?: string;
  dryRun?: boolean;
  allowedRoots?: readonly string[];
  grantedPermissions?: readonly NativeSearchPermission[];
  auditMetadata?: Readonly<Record<string, unknown>>;
};

export type NativeSearchTarget = {
  query: string;
  rootPath: string;
  includeHidden?: boolean;
  maxResults?: number;
  fileGlobs?: readonly string[];
};

export type NativeSearchRequest = {
  target?: Partial<NativeSearchTarget>;
  context?: NativeSearchContext;
};

export type NativeSearchErrorCode =
  | "MISSING_QUERY"
  | "MISSING_ROOT_PATH"
  | "INVALID_MAX_RESULTS"
  | "SCOPE_REJECTED"
  | "PERMISSION_DENIED"
  | "REAL_EXECUTION_BLOCKED";

export type NativeSearchError = {
  code: NativeSearchErrorCode;
  message: string;
  boundary: NativeSearchErrorBoundary;
  publicSafe: true;
  internalDetailExposed: false;
};

export type NativeSearchAuditEvent = {
  type: string;
  toolId: "search.nativeSearch";
  invocationId: string;
  dryRun: boolean;
  rootPath?: string;
  metadata: Readonly<Record<string, unknown>>;
};

export type NativeSearchOutput = {
  kind: "agentCore.basicTool.search.nativeSearch";
  target: NativeSearchTarget;
  commandPreview: readonly string[];
  dryRun: true;
  executionBlocked: true;
  permissionsRequired: readonly NativeSearchPermission[];
  unsafeSideEffects: false;
  resultEnvelope: {
    query: string;
    matches: readonly {
      path: string;
      line?: number;
      preview?: string;
    }[];
  };
};

export type NativeSearchResult =
  | {
      ok: true;
      toolId: "search.nativeSearch";
      output: NativeSearchOutput;
      audit: readonly NativeSearchAuditEvent[];
      events: readonly string[];
    }
  | {
      ok: false;
      toolId: "search.nativeSearch";
      error: NativeSearchError;
      audit: readonly NativeSearchAuditEvent[];
      events: readonly string[];
    };

export const nativeSearchDescriptor = {
  toolId: "search.nativeSearch",
  capability: "native-filesystem-search",
  route: "agent_executionEngine.basic_toolLayer.baseTools.searchBase",
  defaultDryRun: true,
  tapOwnsApproval: true,
  permissionsRequired: ["filesystem:read", "search:native"],
  unsafeSideEffects: false,
} as const;

const defaultMaxResults = 50;
const maxResultLimit = 1000;

function cleanList<T extends string>(values: readonly T[] | undefined): readonly T[] {
  return [...new Set((values ?? []).map((value) => value.trim()).filter(Boolean) as T[])];
}

function dryRunEnabled(context: NativeSearchContext | undefined): boolean {
  return context?.dryRun !== false;
}

function invocationId(context: NativeSearchContext | undefined): string {
  return context?.invocationId?.trim() || "search.nativeSearch:dry-run";
}

function normalizeRoot(root: string): string {
  const trimmed = root.trim();
  return trimmed === "/" ? trimmed : trimmed.replace(/\/+$/, "");
}

function auditEvent(
  type: string,
  context: NativeSearchContext | undefined,
  rootPath?: string,
  metadata?: Readonly<Record<string, unknown>>,
): NativeSearchAuditEvent {
  return {
    type,
    toolId: nativeSearchDescriptor.toolId,
    invocationId: invocationId(context),
    dryRun: dryRunEnabled(context),
    rootPath,
    metadata: {
      ...(context?.auditMetadata ?? {}),
      ...(metadata ?? {}),
    },
  };
}

function failure(
  code: NativeSearchErrorCode,
  message: string,
  boundary: NativeSearchErrorBoundary,
  context: NativeSearchContext | undefined,
  rootPath?: string,
): NativeSearchResult {
  return {
    ok: false,
    toolId: nativeSearchDescriptor.toolId,
    error: { code, message, boundary, publicSafe: true, internalDetailExposed: false },
    audit: [auditEvent("agentCore.basicTool.search.nativeSearch.rejected", context, rootPath, { code })],
    events: ["basicTool.search.nativeSearch.rejected"],
  };
}

function normalizeTarget(
  target: Partial<NativeSearchTarget> | undefined,
  context: NativeSearchContext | undefined,
): NativeSearchTarget | NativeSearchResult {
  const query = target?.query?.trim() ?? "";
  if (query.length === 0) {
    return failure("MISSING_QUERY", "search.nativeSearch requires target.query", "input", context, target?.rootPath);
  }

  const rootPath = target?.rootPath?.trim() ?? "";
  if (rootPath.length === 0) {
    return failure("MISSING_ROOT_PATH", "search.nativeSearch requires target.rootPath", "input", context, target?.rootPath);
  }

  const maxResults = target?.maxResults ?? defaultMaxResults;
  if (!Number.isInteger(maxResults) || maxResults < 1 || maxResults > maxResultLimit) {
    return failure(
      "INVALID_MAX_RESULTS",
      `search.nativeSearch maxResults must be an integer between 1 and ${maxResultLimit}`,
      "resource",
      context,
      rootPath,
    );
  }

  return {
    query,
    rootPath: normalizeRoot(rootPath),
    includeHidden: target?.includeHidden === true,
    maxResults,
    fileGlobs: cleanList(target?.fileGlobs),
  };
}

function ensureScope(rootPath: string, context: NativeSearchContext | undefined): NativeSearchResult | undefined {
  const allowedRoots = cleanList(context?.allowedRoots).map(normalizeRoot);
  if (allowedRoots.length === 0) {
    return undefined;
  }

  const allowed = allowedRoots.some((root) => rootPath === root || rootPath.startsWith(`${root}/`));
  if (allowed) {
    return undefined;
  }

  return failure(
    "SCOPE_REJECTED",
    "search.nativeSearch target rootPath is outside the allowed search roots",
    "scope",
    context,
    rootPath,
  );
}

function ensurePermissions(rootPath: string, context: NativeSearchContext | undefined): NativeSearchResult | undefined {
  if (context?.grantedPermissions === undefined) {
    return undefined;
  }

  const granted = cleanList(context?.grantedPermissions);
  const missing = nativeSearchDescriptor.permissionsRequired.filter((permission) => !granted.includes(permission));
  if (missing.length === 0) {
    return undefined;
  }

  return failure(
    "PERMISSION_DENIED",
    `search.nativeSearch is missing permissions: ${missing.join(", ")}`,
    "permission",
    context,
    rootPath,
  );
}

function ensureDryRunOnly(rootPath: string, context: NativeSearchContext | undefined): NativeSearchResult | undefined {
  if (dryRunEnabled(context)) {
    return undefined;
  }

  return failure(
    "REAL_EXECUTION_BLOCKED",
    "search.nativeSearch only returns a guarded dry-run local search plan in the first implementation",
    "contract",
    context,
    rootPath,
  );
}

function commandPreview(target: NativeSearchTarget): readonly string[] {
  return [
    "rg",
    "--line-number",
    "--max-count",
    String(target.maxResults ?? defaultMaxResults),
    ...(target.includeHidden === true ? ["--hidden"] : []),
    ...(target.fileGlobs ?? []).flatMap((glob) => ["--glob", glob]),
    target.query,
    target.rootPath,
  ];
}

export function planNativeSearch(request: NativeSearchRequest = {}): NativeSearchResult {
  const target = normalizeTarget(request.target, request.context);
  if ("ok" in target) {
    return target;
  }

  const scopeFailure = ensureScope(target.rootPath, request.context);
  if (scopeFailure !== undefined) {
    return scopeFailure;
  }

  const permissionFailure = ensurePermissions(target.rootPath, request.context);
  if (permissionFailure !== undefined) {
    return permissionFailure;
  }

  const realExecutionFailure = ensureDryRunOnly(target.rootPath, request.context);
  if (realExecutionFailure !== undefined) {
    return realExecutionFailure;
  }

  return {
    ok: true,
    toolId: nativeSearchDescriptor.toolId,
    output: {
      kind: "agentCore.basicTool.search.nativeSearch",
      target,
      commandPreview: commandPreview(target),
      dryRun: true,
      executionBlocked: true,
      permissionsRequired: nativeSearchDescriptor.permissionsRequired,
      unsafeSideEffects: false,
      resultEnvelope: {
        query: target.query,
        matches: [],
      },
    },
    audit: [
      auditEvent("agentCore.basicTool.search.nativeSearch.dryRun", request.context, target.rootPath, {
        includeHidden: target.includeHidden,
        maxResults: target.maxResults,
        fileGlobs: target.fileGlobs,
      }),
    ],
    events: ["basicTool.search.nativeSearch.dryRun"],
  };
}
