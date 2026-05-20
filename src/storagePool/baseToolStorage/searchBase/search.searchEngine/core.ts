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
export type SearchEngineBoundary = "input" | "scope" | "permission" | "resource" | "governance" | "provider";

export type SearchEngineGate = {
  accepted?: boolean;
  allowed?: boolean;
  reason?: string;
};

export type SearchEngineContext = {
  runtimeId?: string;
  sessionId?: string;
  invocationId?: string;
  dryRun?: boolean;
  guard?: SearchEngineGate;
  allowedProviders?: readonly SearchEngineProvider[];
  grantedPermissions?: readonly SearchEnginePermission[];
  auditMetadata?: Readonly<Record<string, unknown>>;
};

export type SearchEngineTarget = {
  query: string;
  provider: SearchEngineProvider;
  maxResults: number;
  recencyDays?: number;
  safeSearch: boolean;
  locale?: string;
};

export type SearchEngineResultItem = {
  title: string;
  url: string;
  snippet?: string;
  raw?: unknown;
};

export type SearchEngineExecution = {
  results: readonly SearchEngineResultItem[];
  providerMetadata?: Readonly<Record<string, unknown>>;
  raw?: unknown;
};

export type SearchEngineExecutor = (request: {
  provider: SearchEngineProvider;
  query: string;
  maxResults?: number;
  recencyDays?: number;
  safeSearch?: boolean;
  locale?: string;
  context?: SearchEngineContext;
}) => SearchEngineExecution | Promise<SearchEngineExecution>;

export type SearchEngineRequest = {
  target?: Partial<SearchEngineTarget>;
  context?: SearchEngineContext;
  executor?: SearchEngineExecutor;
  provider?: SearchEngineExecutor;
  metadata?: Readonly<Record<string, unknown>>;
};

export type SearchEngineErrorCode =
  | "INVALID_REQUEST"
  | "INVALID_CONTEXT"
  | "MISSING_QUERY"
  | "INVALID_PROVIDER"
  | "PROVIDER_NOT_ALLOWED"
  | "INVALID_MAX_RESULTS"
  | "INVALID_RECENCY"
  | "INVALID_LOCALE"
  | "PERMISSION_DENIED"
  | "GOVERNANCE_REJECTED"
  | "PROVIDER_UNAVAILABLE"
  | "PROVIDER_REJECTED"
  | "PROVIDER_RESULT_INVALID";

export type SearchEngineError = {
  code: SearchEngineErrorCode;
  message: string;
  boundary: SearchEngineBoundary;
  publicSafe: true;
  safeForRuntimeInspection: true;
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
  target: SearchEngineTarget;
  requestPreview: SearchEngineTarget;
  dispatch: "dry-run" | "runtime-search";
  dryRun: boolean;
  providerCalled: boolean;
  executionBlocked: boolean;
  permissionsRequired: readonly SearchEnginePermission[];
  unsafeSideEffects: false;
  runtimeEntry: {
    port: "BaseToolExecutorPort.network.search";
    provider: SearchEngineProvider;
    runtimeOwnsNetwork: true;
    baseToolOwnsProviderClient: false;
  };
  resultEnvelope: {
    query: string;
    results: readonly SearchEngineResultItem[];
    providerMetadata?: Readonly<Record<string, unknown>>;
    raw?: unknown;
  };
};

export type SearchEngineResult =
  | { ok: true; toolId: "search.searchEngine"; output: SearchEngineOutput; audit: readonly SearchEngineAuditEvent[]; events: readonly string[] }
  | { ok: false; toolId: "search.searchEngine"; error: SearchEngineError; audit: readonly SearchEngineAuditEvent[]; events: readonly string[] };

export const searchEngineDescriptor = {
  toolId: "search.searchEngine",
  capability: "external-search-engine-query",
  route: "agent_executionEngine.basic_toolLayer.baseTools.searchBase",
  defaultDryRun: true,
  permissionsRequired: ["network:search"],
  tapOwnsApproval: true,
  unsafeSideEffects: false,
  runtimeEntryPort: "BaseToolExecutorPort.network.search",
} as const;

const providers = ["generic", "browser", "custom"] as const;
const defaultMaxResults = 10;
const maxResultLimit = 50;

type NormalizedRequest = {
  target: SearchEngineTarget;
  context: SearchEngineContext;
  executor?: SearchEngineExecutor;
  metadata: Readonly<Record<string, unknown>>;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function stringValue(value: unknown): string | undefined {
  return typeof value === "string" ? value : undefined;
}

function booleanValue(value: unknown): boolean | undefined {
  return typeof value === "boolean" ? value : undefined;
}

function dryRunEnabled(context: SearchEngineContext | undefined): boolean {
  return context?.dryRun !== false;
}

function invocationId(context: SearchEngineContext | undefined): string {
  return context?.invocationId?.trim() || "search.searchEngine:dry-run";
}

function isProvider(value: unknown): value is SearchEngineProvider {
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
    metadata: { ...(context?.auditMetadata ?? {}), ...(metadata ?? {}) },
  };
}

function failure(
  code: SearchEngineErrorCode,
  message: string,
  boundary: SearchEngineBoundary,
  context?: SearchEngineContext,
  provider?: SearchEngineProvider,
): SearchEngineResult {
  return {
    ok: false,
    toolId: searchEngineDescriptor.toolId,
    error: { code, message, boundary, publicSafe: true, safeForRuntimeInspection: true, internalDetailExposed: false },
    audit: [auditEvent("agentCore.basicTool.search.searchEngine.rejected", context, provider, { code })],
    events: ["basicTool.search.searchEngine.rejected"],
  };
}

function cleanStringList(value: unknown, message: string): readonly string[] | SearchEngineResult {
  if (value === undefined) return [];
  if (!Array.isArray(value)) return failure("INVALID_CONTEXT", message, "input");
  const normalized: string[] = [];
  for (const item of value) {
    if (typeof item !== "string" || item.includes("\0")) return failure("INVALID_CONTEXT", message, "input");
    const trimmed = item.trim();
    if (trimmed.length > 0) normalized.push(trimmed);
  }
  return [...new Set(normalized)];
}

function normalizeContext(value: unknown): SearchEngineContext | SearchEngineResult {
  if (value === undefined) return {};
  if (!isRecord(value)) return failure("INVALID_CONTEXT", "search.searchEngine context must be an object when provided", "input");
  let guard: SearchEngineGate | undefined;
  if (value.guard !== undefined) {
    if (!isRecord(value.guard)) return failure("INVALID_CONTEXT", "search.searchEngine context.guard must be an object when provided", "input");
    const reason = stringValue(value.guard.reason);
    guard = { accepted: booleanValue(value.guard.accepted), allowed: booleanValue(value.guard.allowed), ...(reason !== undefined ? { reason } : {}) };
  }
  const allowedRaw = cleanStringList(value.allowedProviders, "search.searchEngine context.allowedProviders must be a string array");
  if ("ok" in allowedRaw) return allowedRaw;
  const allowedProviders: SearchEngineProvider[] = [];
  for (const provider of allowedRaw) {
    if (!isProvider(provider)) return failure("INVALID_CONTEXT", "search.searchEngine context.allowedProviders contains an unsupported provider", "input");
    allowedProviders.push(provider);
  }
  const permissions = cleanStringList(value.grantedPermissions, "search.searchEngine context.grantedPermissions must be a string array");
  if ("ok" in permissions) return permissions;
  const auditMetadata = isRecord(value.auditMetadata) ? value.auditMetadata : undefined;
  if (value.auditMetadata !== undefined && auditMetadata === undefined) {
    return failure("INVALID_CONTEXT", "search.searchEngine context.auditMetadata must be an object when provided", "input");
  }
  const runtimeId = stringValue(value.runtimeId);
  const sessionId = stringValue(value.sessionId);
  const invocation = stringValue(value.invocationId);
  const dryRun = booleanValue(value.dryRun);
  if (
    (value.runtimeId !== undefined && runtimeId === undefined) ||
    (value.sessionId !== undefined && sessionId === undefined) ||
    (value.invocationId !== undefined && invocation === undefined) ||
    (value.dryRun !== undefined && dryRun === undefined)
  ) {
    return failure("INVALID_CONTEXT", "search.searchEngine context has invalid scalar fields", "input");
  }
  return {
    ...(runtimeId !== undefined ? { runtimeId } : {}),
    ...(sessionId !== undefined ? { sessionId } : {}),
    ...(invocation !== undefined ? { invocationId: invocation } : {}),
    ...(dryRun !== undefined ? { dryRun } : {}),
    ...(guard !== undefined ? { guard } : {}),
    allowedProviders,
    grantedPermissions: permissions as readonly SearchEnginePermission[],
    ...(auditMetadata !== undefined ? { auditMetadata } : {}),
  };
}

function normalizeTarget(value: unknown, context: SearchEngineContext): SearchEngineTarget | SearchEngineResult {
  if (value !== undefined && !isRecord(value)) return failure("INVALID_REQUEST", "search.searchEngine target must be an object when provided", "input", context);
  const target = isRecord(value) ? value : {};
  const rawQuery = target.query;
  if (rawQuery === undefined) return failure("MISSING_QUERY", "search.searchEngine requires target.query", "input", context);
  if (typeof rawQuery !== "string") return failure("MISSING_QUERY", "search.searchEngine target.query must be a string", "input", context);
  const query = rawQuery.trim();
  if (query.length === 0 || query.includes("\0")) return failure("MISSING_QUERY", "search.searchEngine requires a non-empty safe target.query", "input", context);
  const provider = stringValue(target.provider)?.trim() || "generic";
  if (!isProvider(provider)) return failure("INVALID_PROVIDER", "search.searchEngine target.provider is not supported", "input", context);
  if ((context.allowedProviders ?? []).length > 0 && !context.allowedProviders?.includes(provider)) {
    return failure("PROVIDER_NOT_ALLOWED", "search.searchEngine target.provider is outside runtime governance", "scope", context, provider);
  }
  const maxResults = target.maxResults ?? defaultMaxResults;
  if (typeof maxResults !== "number" || !Number.isInteger(maxResults) || maxResults < 1 || maxResults > maxResultLimit) {
    return failure("INVALID_MAX_RESULTS", `search.searchEngine maxResults must be an integer between 1 and ${maxResultLimit}`, "resource", context, provider);
  }
  const recencyDays = target.recencyDays;
  if (recencyDays !== undefined && (typeof recencyDays !== "number" || !Number.isInteger(recencyDays) || recencyDays < 1)) {
    return failure("INVALID_RECENCY", "search.searchEngine recencyDays must be a positive integer", "input", context, provider);
  }
  const safeSearch = target.safeSearch === undefined ? true : booleanValue(target.safeSearch);
  if (safeSearch === undefined) return failure("INVALID_REQUEST", "search.searchEngine safeSearch must be boolean when provided", "input", context, provider);
  const locale = target.locale === undefined ? undefined : stringValue(target.locale)?.trim();
  if (target.locale !== undefined && (locale === undefined || locale.length === 0 || locale.includes("\0"))) {
    return failure("INVALID_LOCALE", "search.searchEngine locale must be a non-empty string when provided", "input", context, provider);
  }
  return { query, provider, maxResults, ...(recencyDays !== undefined ? { recencyDays } : {}), safeSearch, ...(locale !== undefined ? { locale } : {}) };
}

function normalizeRequest(request: unknown): NormalizedRequest | SearchEngineResult {
  if (request === undefined) request = {};
  if (!isRecord(request)) return failure("INVALID_REQUEST", "search.searchEngine request must be an object", "input");
  const context = normalizeContext(request.context);
  if ("ok" in context) return context;
  const target = normalizeTarget(request.target, context);
  if ("ok" in target) return target;
  const metadata = request.metadata;
  if (metadata !== undefined && !isRecord(metadata)) return failure("INVALID_REQUEST", "search.searchEngine metadata must be an object when provided", "input", context, target.provider);
  const executor = request.executor ?? request.provider;
  if (executor !== undefined && typeof executor !== "function") return failure("INVALID_REQUEST", "search.searchEngine executor must be a function when provided", "input", context, target.provider);
  return { target, context, executor: executor as SearchEngineExecutor | undefined, metadata: metadata ?? {} };
}

function ensurePermissions(target: SearchEngineTarget, context: SearchEngineContext): SearchEngineResult | undefined {
  if (context.grantedPermissions === undefined || context.grantedPermissions.length === 0) {
    return dryRunEnabled(context)
      ? undefined
      : failure("PERMISSION_DENIED", `search.searchEngine is missing permissions: ${searchEngineDescriptor.permissionsRequired.join(", ")}`, "permission", context, target.provider);
  }
  const granted = new Set(context.grantedPermissions);
  const missing = searchEngineDescriptor.permissionsRequired.filter((permission) => !granted.has(permission));
  return missing.length === 0 ? undefined : failure("PERMISSION_DENIED", `search.searchEngine is missing permissions: ${missing.join(", ")}`, "permission", context, target.provider);
}

function ensureGovernance(target: SearchEngineTarget, context: SearchEngineContext): SearchEngineResult | undefined {
  if (dryRunEnabled(context)) return undefined;
  if (context.guard?.accepted === true || context.guard?.allowed === true) return undefined;
  return failure("GOVERNANCE_REJECTED", context.guard?.reason ?? "search.searchEngine real execution requires an affirmative runtime guard", "governance", context, target.provider);
}

function dryRunResult(request: NormalizedRequest): SearchEngineResult {
  return {
    ok: true,
    toolId: searchEngineDescriptor.toolId,
    output: {
      kind: "agentCore.basicTool.search.searchEngine",
      target: request.target,
      requestPreview: request.target,
      dispatch: "dry-run",
      dryRun: true,
      providerCalled: false,
      executionBlocked: true,
      permissionsRequired: searchEngineDescriptor.permissionsRequired,
      unsafeSideEffects: false,
      runtimeEntry: {
        port: searchEngineDescriptor.runtimeEntryPort,
        provider: request.target.provider,
        runtimeOwnsNetwork: true,
        baseToolOwnsProviderClient: false,
      },
      resultEnvelope: { query: request.target.query, results: [] },
    },
    audit: [auditEvent("agentCore.basicTool.search.searchEngine.dryRun", request.context, request.target.provider, request.metadata)],
    events: ["basicTool.search.searchEngine.dryRun"],
  };
}

function normalizeExecutionOutput(request: NormalizedRequest, execution: SearchEngineExecution): SearchEngineResult {
  if (!Array.isArray(execution.results)) {
    return failure("PROVIDER_RESULT_INVALID", "search.searchEngine provider returned invalid results", "provider", request.context, request.target.provider);
  }
  const results = execution.results
    .map((item): SearchEngineResultItem | undefined => {
      if (!isRecord(item) || typeof item.title !== "string" || typeof item.url !== "string") return undefined;
      const title = item.title.trim();
      const url = item.url.trim();
      if (title.length === 0 || url.length === 0) return undefined;
      return { title, url, ...(typeof item.snippet === "string" && item.snippet.trim().length > 0 ? { snippet: item.snippet.trim() } : {}), ...(item.raw !== undefined ? { raw: item.raw } : {}) };
    })
    .filter((item): item is SearchEngineResultItem => item !== undefined)
    .slice(0, request.target.maxResults);
  return {
    ok: true,
    toolId: searchEngineDescriptor.toolId,
    output: {
      kind: "agentCore.basicTool.search.searchEngine",
      target: request.target,
      requestPreview: request.target,
      dispatch: "runtime-search",
      dryRun: false,
      providerCalled: true,
      executionBlocked: false,
      permissionsRequired: searchEngineDescriptor.permissionsRequired,
      unsafeSideEffects: false,
      runtimeEntry: {
        port: searchEngineDescriptor.runtimeEntryPort,
        provider: request.target.provider,
        runtimeOwnsNetwork: true,
        baseToolOwnsProviderClient: false,
      },
      resultEnvelope: {
        query: request.target.query,
        results,
        ...(execution.providerMetadata !== undefined ? { providerMetadata: execution.providerMetadata } : {}),
        ...(execution.raw !== undefined ? { raw: execution.raw } : {}),
      },
    },
    audit: [auditEvent("agentCore.basicTool.search.searchEngine.executed", request.context, request.target.provider, { resultCount: results.length, ...request.metadata })],
    events: ["basicTool.search.searchEngine.executed"],
  };
}

export async function planSearchEngineQuery(request: SearchEngineRequest = {}): Promise<SearchEngineResult> {
  const normalized = normalizeRequest(request);
  if ("ok" in normalized) return normalized;
  const permissionFailure = ensurePermissions(normalized.target, normalized.context);
  if (permissionFailure !== undefined) return permissionFailure;
  const governanceFailure = ensureGovernance(normalized.target, normalized.context);
  if (governanceFailure !== undefined) return governanceFailure;
  if (dryRunEnabled(normalized.context)) return dryRunResult(normalized);
  if (normalized.executor === undefined) {
    return failure("PROVIDER_UNAVAILABLE", "search.searchEngine real execution requires BaseToolExecutorPort.network.search or an injected search provider", "provider", normalized.context, normalized.target.provider);
  }
  try {
    return normalizeExecutionOutput(
      normalized,
      await normalized.executor({
        provider: normalized.target.provider,
        query: normalized.target.query,
        maxResults: normalized.target.maxResults,
        recencyDays: normalized.target.recencyDays,
        safeSearch: normalized.target.safeSearch,
        locale: normalized.target.locale,
        context: normalized.context,
      }),
    );
  } catch {
    return failure("PROVIDER_REJECTED", "search.searchEngine provider rejected the request", "provider", normalized.context, normalized.target.provider);
  }
}

export const executeSearchEngineQuery = planSearchEngineQuery;
