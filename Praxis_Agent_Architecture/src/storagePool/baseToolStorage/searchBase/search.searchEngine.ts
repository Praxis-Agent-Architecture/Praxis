/*
 * 文件定位：Agent 执行引擎 / 基础工具原语层 / 基础工具集合 / 搜索基础工具。
 * 核心目的：提供 基础工具集合 / 搜索基础工具 中的“调用搜索引擎”基础能力原语。
 * 能力要求1：需要定义该能力的输入、输出、错误、权限需求和可观测事件。
 * 能力要求2：这些基础工具是 Agent 成立的底层能力，不是 TAP 的最终高级工具库。
 * 能力要求3：后续 TAP 可以基于这些原语构建更强的工具编排、审批、替换和专业能力库。
 * 边界：保留 Agent 基础工具原语，不替代 TAP 的高级工具系统。
 * 对接：需要被 runtime.execEngine 拉起，并和 mainLoop、stateEngine、事件暴露、工具调用策略接通。
 * 实现提示：先补稳定类型契约、最小可测行为和清晰错误边界，再接入真实执行逻辑。
 */

export type SearchEngineProvider = "generic" | "browser" | "custom";

export type SearchEnginePermission = "network:search";

export type SearchEngineErrorBoundary = "input" | "scope" | "permission" | "contract" | "resource";

export type SearchEngineContext = {
  runtimeId?: string;
  invocationId?: string;
  dryRun?: boolean;
  allowedProviders?: readonly SearchEngineProvider[];
  grantedPermissions?: readonly SearchEnginePermission[];
  auditMetadata?: Readonly<Record<string, unknown>>;
};

export type SearchEngineTarget = {
  query: string;
  provider?: SearchEngineProvider;
  maxResults?: number;
  recencyDays?: number;
  safeSearch?: boolean;
  locale?: string;
};

export type SearchEngineRequest = {
  target?: Partial<SearchEngineTarget>;
  context?: SearchEngineContext;
};

export type SearchEngineErrorCode =
  | "MISSING_QUERY"
  | "INVALID_PROVIDER"
  | "PROVIDER_NOT_ALLOWED"
  | "INVALID_MAX_RESULTS"
  | "INVALID_RECENCY"
  | "PERMISSION_DENIED"
  | "REAL_EXECUTION_BLOCKED";

export type SearchEngineError = {
  code: SearchEngineErrorCode;
  message: string;
  boundary: SearchEngineErrorBoundary;
  publicSafe: true;
  internalDetailExposed: false;
};

export type SearchEngineAuditEvent = {
  type: string;
  toolId: "search.searchEngine";
  invocationId: string;
  dryRun: boolean;
  provider?: SearchEngineProvider;
  metadata: Readonly<Record<string, unknown>>;
};

export type SearchEngineOutput = {
  kind: "agentCore.basicTool.search.searchEngine";
  target: Required<Pick<SearchEngineTarget, "query" | "provider" | "maxResults" | "safeSearch">> &
    Pick<SearchEngineTarget, "recencyDays" | "locale">;
  requestPreview: {
    provider: SearchEngineProvider;
    query: string;
    maxResults: number;
    recencyDays?: number;
    safeSearch: boolean;
    locale?: string;
  };
  dryRun: true;
  executionBlocked: true;
  permissionsRequired: readonly SearchEnginePermission[];
  unsafeSideEffects: false;
  resultEnvelope: {
    query: string;
    results: readonly {
      title: string;
      url: string;
      snippet?: string;
    }[];
  };
};

export type SearchEngineResult =
  | {
      ok: true;
      toolId: "search.searchEngine";
      output: SearchEngineOutput;
      audit: readonly SearchEngineAuditEvent[];
      events: readonly string[];
    }
  | {
      ok: false;
      toolId: "search.searchEngine";
      error: SearchEngineError;
      audit: readonly SearchEngineAuditEvent[];
      events: readonly string[];
    };

export const searchEngineDescriptor = {
  toolId: "search.searchEngine",
  capability: "external-search-engine-query",
  route: "agent_executionEngine.basic_toolLayer.baseTools.searchBase",
  defaultDryRun: true,
  tapOwnsApproval: true,
  permissionsRequired: ["network:search"],
  unsafeSideEffects: false,
} as const;

const providers = ["generic", "browser", "custom"] as const;
const defaultMaxResults = 10;
const maxResultLimit = 50;

function cleanList<T extends string>(values: readonly T[] | undefined): readonly T[] {
  return [...new Set((values ?? []).map((value) => value.trim()).filter(Boolean) as T[])];
}

function dryRunEnabled(context: SearchEngineContext | undefined): boolean {
  return context?.dryRun !== false;
}

function invocationId(context: SearchEngineContext | undefined): string {
  return context?.invocationId?.trim() || "search.searchEngine:dry-run";
}

function isProvider(value: string | undefined): value is SearchEngineProvider {
  return providers.includes(value as SearchEngineProvider);
}

function auditEvent(
  type: string,
  context: SearchEngineContext | undefined,
  provider?: SearchEngineProvider,
  metadata?: Readonly<Record<string, unknown>>,
): SearchEngineAuditEvent {
  return {
    type,
    toolId: searchEngineDescriptor.toolId,
    invocationId: invocationId(context),
    dryRun: dryRunEnabled(context),
    provider,
    metadata: {
      ...(context?.auditMetadata ?? {}),
      ...(metadata ?? {}),
    },
  };
}

function failure(
  code: SearchEngineErrorCode,
  message: string,
  boundary: SearchEngineErrorBoundary,
  context: SearchEngineContext | undefined,
  provider?: SearchEngineProvider,
): SearchEngineResult {
  return {
    ok: false,
    toolId: searchEngineDescriptor.toolId,
    error: { code, message, boundary, publicSafe: true, internalDetailExposed: false },
    audit: [auditEvent("agentCore.basicTool.search.searchEngine.rejected", context, provider, { code })],
    events: ["basicTool.search.searchEngine.rejected"],
  };
}

function normalizeProvider(
  provider: string | undefined,
  context: SearchEngineContext | undefined,
): SearchEngineProvider | SearchEngineResult {
  const normalized = provider?.trim() || "generic";
  if (!isProvider(normalized)) {
    return failure("INVALID_PROVIDER", "search.searchEngine target.provider is not supported", "input", context);
  }

  const allowedProviders = cleanList(context?.allowedProviders);
  if (allowedProviders.length > 0 && !allowedProviders.includes(normalized)) {
    return failure(
      "PROVIDER_NOT_ALLOWED",
      "search.searchEngine target.provider is outside runtime governance",
      "scope",
      context,
      normalized,
    );
  }

  return normalized;
}

function normalizeTarget(
  target: Partial<SearchEngineTarget> | undefined,
  context: SearchEngineContext | undefined,
): SearchEngineOutput["target"] | SearchEngineResult {
  const query = target?.query?.trim() ?? "";
  if (query.length === 0) {
    return failure("MISSING_QUERY", "search.searchEngine requires target.query", "input", context);
  }

  const provider = normalizeProvider(target?.provider, context);
  if (typeof provider !== "string") {
    return provider;
  }

  const maxResults = target?.maxResults ?? defaultMaxResults;
  if (!Number.isInteger(maxResults) || maxResults < 1 || maxResults > maxResultLimit) {
    return failure(
      "INVALID_MAX_RESULTS",
      `search.searchEngine maxResults must be an integer between 1 and ${maxResultLimit}`,
      "resource",
      context,
      provider,
    );
  }

  const recencyDays = target?.recencyDays;
  if (recencyDays !== undefined && (!Number.isInteger(recencyDays) || recencyDays < 1)) {
    return failure("INVALID_RECENCY", "search.searchEngine recencyDays must be a positive integer", "input", context, provider);
  }

  return {
    query,
    provider,
    maxResults,
    recencyDays,
    safeSearch: target?.safeSearch !== false,
    locale: target?.locale?.trim() || undefined,
  };
}

function ensurePermissions(provider: SearchEngineProvider, context: SearchEngineContext | undefined): SearchEngineResult | undefined {
  if (context?.grantedPermissions === undefined) {
    return undefined;
  }

  const granted = cleanList(context?.grantedPermissions);
  const missing = searchEngineDescriptor.permissionsRequired.filter((permission) => !granted.includes(permission));
  if (missing.length === 0) {
    return undefined;
  }

  return failure(
    "PERMISSION_DENIED",
    `search.searchEngine is missing permissions: ${missing.join(", ")}`,
    "permission",
    context,
    provider,
  );
}

function ensureDryRunOnly(provider: SearchEngineProvider, context: SearchEngineContext | undefined): SearchEngineResult | undefined {
  if (dryRunEnabled(context)) {
    return undefined;
  }

  return failure(
    "REAL_EXECUTION_BLOCKED",
    "search.searchEngine only returns a guarded dry-run provider request plan in the first implementation",
    "contract",
    context,
    provider,
  );
}

export function planSearchEngineQuery(request: SearchEngineRequest = {}): SearchEngineResult {
  const target = normalizeTarget(request.target, request.context);
  if ("ok" in target) {
    return target;
  }

  const permissionFailure = ensurePermissions(target.provider, request.context);
  if (permissionFailure !== undefined) {
    return permissionFailure;
  }

  const realExecutionFailure = ensureDryRunOnly(target.provider, request.context);
  if (realExecutionFailure !== undefined) {
    return realExecutionFailure;
  }

  const requestPreview = {
    provider: target.provider,
    query: target.query,
    maxResults: target.maxResults,
    recencyDays: target.recencyDays,
    safeSearch: target.safeSearch,
    locale: target.locale,
  };

  return {
    ok: true,
    toolId: searchEngineDescriptor.toolId,
    output: {
      kind: "agentCore.basicTool.search.searchEngine",
      target,
      requestPreview,
      dryRun: true,
      executionBlocked: true,
      permissionsRequired: searchEngineDescriptor.permissionsRequired,
      unsafeSideEffects: false,
      resultEnvelope: {
        query: target.query,
        results: [],
      },
    },
    audit: [
      auditEvent("agentCore.basicTool.search.searchEngine.dryRun", request.context, target.provider, {
        maxResults: target.maxResults,
        recencyDays: target.recencyDays,
        safeSearch: target.safeSearch,
      }),
    ],
    events: ["basicTool.search.searchEngine.dryRun"],
  };
}
