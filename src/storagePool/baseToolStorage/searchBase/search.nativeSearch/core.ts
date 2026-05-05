/*
 * 文件定位：Agent 执行引擎 / 基础工具原语层 / 基础工具集合 / 搜索基础工具。
 * 核心目的：提供 基础工具集合 / 搜索基础工具 中的“三家官方原生网络搜索”基础能力原语。
 * 能力要求1：需要定义该能力的输入、输出、错误、权限需求和可观测事件。
 * 能力要求2：这些基础工具是 Agent 成立的底层能力，不是 TAP 的最终高级工具库。
 * 能力要求3：后续 TAP 可以基于这些原语构建更强的工具编排、审批、替换和专业能力库。
 * 边界：保留 Agent 基础工具原语，不替代 TAP 的高级工具系统。
 * 对接：需要被 runtime.execEngine 拉起，并和 mainLoop、stateEngine、事件暴露、工具调用策略接通。
 * 实现提示：先补稳定类型契约、最小可测行为和清晰错误边界，再接入真实执行逻辑。
 */

export type NativeSearchProvider = "openai" | "anthropic" | "deepmind";

export type NativeSearchPermission = "network:search" | "search:native";

export type NativeSearchFreshness = "any" | "day" | "week" | "month" | "year";

export type NativeSearchContextSize = "low" | "medium" | "high";

export type NativeSearchCitationMode = "required" | "preferred" | "off";

export type NativeSearchErrorBoundary =
  | "input"
  | "scope"
  | "permission"
  | "contract"
  | "resource"
  | "governance"
  | "provider";

export type NativeSearchGate = {
  accepted?: boolean;
  allowed?: boolean;
  reason?: string;
};

export type NativeSearchUserLocation = {
  city?: string;
  region?: string;
  country?: string;
  timezone?: string;
};

export type NativeSearchContext = {
  runtimeId?: string;
  sessionId?: string;
  invocationId?: string;
  dryRun?: boolean;
  guard?: NativeSearchGate;
  allowedProviders?: readonly NativeSearchProvider[];
  grantedPermissions?: readonly NativeSearchPermission[];
  auditMetadata?: Readonly<Record<string, unknown>>;
};

export type NativeSearchTarget = {
  provider: NativeSearchProvider;
  query: string;
  model?: string;
  maxResults?: number;
  recencyDays?: number;
  freshness?: NativeSearchFreshness;
  allowedDomains?: readonly string[];
  searchContextSize?: NativeSearchContextSize;
  userLocation?: NativeSearchUserLocation;
  citations?: NativeSearchCitationMode;
};

export type NativeSearchSource = {
  title?: string;
  url: string;
  snippet?: string;
  kind?: "search_result" | "citation" | "provider_native";
  raw?: unknown;
};

export type NativeSearchCitation = {
  url: string;
  title?: string;
  snippet?: string;
  providerReference?: string;
  raw?: unknown;
};

export type NativeSearchExecution = {
  answer?: string;
  sources: readonly NativeSearchSource[];
  citations?: readonly NativeSearchCitation[];
  providerMetadata?: Readonly<Record<string, unknown>>;
  raw?: unknown;
};

export type NativeSearchExecutor = (request: {
  provider: NativeSearchProvider;
  query: string;
  model?: string;
  maxResults?: number;
  recencyDays?: number;
  freshness?: NativeSearchFreshness;
  allowedDomains?: readonly string[];
  searchContextSize?: NativeSearchContextSize;
  userLocation?: NativeSearchUserLocation;
  citations?: NativeSearchCitationMode;
  context?: NativeSearchContext;
}) => NativeSearchExecution | Promise<NativeSearchExecution>;

export type NativeSearchRequest = {
  target?: Partial<NativeSearchTarget>;
  context?: NativeSearchContext;
  executor?: NativeSearchExecutor;
  provider?: NativeSearchExecutor;
  metadata?: Readonly<Record<string, unknown>>;
};

export type NativeSearchErrorCode =
  | "INVALID_REQUEST"
  | "INVALID_CONTEXT"
  | "MISSING_PROVIDER"
  | "INVALID_PROVIDER"
  | "PROVIDER_NOT_ALLOWED"
  | "MISSING_QUERY"
  | "INVALID_QUERY"
  | "INVALID_MODEL"
  | "INVALID_MAX_RESULTS"
  | "INVALID_RECENCY"
  | "INVALID_FRESHNESS"
  | "INVALID_ALLOWED_DOMAIN"
  | "INVALID_SEARCH_CONTEXT_SIZE"
  | "INVALID_USER_LOCATION"
  | "INVALID_CITATIONS"
  | "PERMISSION_DENIED"
  | "GOVERNANCE_REJECTED"
  | "PROVIDER_UNAVAILABLE"
  | "PROVIDER_REJECTED"
  | "PROVIDER_RESULT_INVALID";

export type NativeSearchError = {
  code: NativeSearchErrorCode;
  message: string;
  boundary: NativeSearchErrorBoundary;
  publicSafe: true;
  safeForRuntimeInspection: true;
  internalDetailExposed: false;
};

export type NativeSearchAuditEvent = {
  type: string;
  toolId: "search.nativeSearch";
  invocationId: string;
  dryRun: boolean;
  provider?: NativeSearchProvider;
  metadata: Readonly<Record<string, unknown>>;
};

export type NativeSearchOutput = {
  kind: "agentCore.basicTool.search.nativeSearch";
  target: NativeSearchTarget;
  requestPreview: NativeSearchTarget;
  dispatch: "dry-run" | "provider-native";
  dryRun: boolean;
  executionBlocked: boolean;
  permissionsRequired: readonly NativeSearchPermission[];
  unsafeSideEffects: false;
  resultEnvelope: {
    query: string;
    answer?: string;
    sources: readonly NativeSearchSource[];
    citations: readonly NativeSearchCitation[];
    providerMetadata?: Readonly<Record<string, unknown>>;
    raw?: unknown;
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
  capability: "provider-native-web-search",
  route: "agent_executionEngine.basic_toolLayer.baseTools.searchBase",
  defaultDryRun: true,
  tapOwnsApproval: true,
  permissionsRequired: ["network:search", "search:native"],
  unsafeSideEffects: false,
} as const;

const providers = ["openai", "anthropic", "deepmind"] as const;
const freshnessValues = ["any", "day", "week", "month", "year"] as const;
const contextSizeValues = ["low", "medium", "high"] as const;
const citationModes = ["required", "preferred", "off"] as const;
const defaultMaxResults = 10;
const maxResultLimit = 50;
const maxDomainCount = 64;

type NormalizedRequest = {
  target: NativeSearchTarget;
  context: NativeSearchContext;
  executor?: NativeSearchExecutor;
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

function dryRunEnabled(context: NativeSearchContext | undefined): boolean {
  return context?.dryRun !== false;
}

function invocationId(context: NativeSearchContext | undefined): string {
  return context?.invocationId?.trim() || "search.nativeSearch:dry-run";
}

function isProvider(value: unknown): value is NativeSearchProvider {
  return providers.includes(value as NativeSearchProvider);
}

function isFreshness(value: unknown): value is NativeSearchFreshness {
  return freshnessValues.includes(value as NativeSearchFreshness);
}

function isContextSize(value: unknown): value is NativeSearchContextSize {
  return contextSizeValues.includes(value as NativeSearchContextSize);
}

function isCitationMode(value: unknown): value is NativeSearchCitationMode {
  return citationModes.includes(value as NativeSearchCitationMode);
}

function auditEvent(
  type: string,
  context: NativeSearchContext | undefined,
  provider?: NativeSearchProvider,
  metadata?: Readonly<Record<string, unknown>>,
): NativeSearchAuditEvent {
  return {
    type,
    toolId: nativeSearchDescriptor.toolId,
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
  code: NativeSearchErrorCode,
  message: string,
  boundary: NativeSearchErrorBoundary,
  context?: NativeSearchContext,
  provider?: NativeSearchProvider,
): NativeSearchResult {
  return {
    ok: false,
    toolId: nativeSearchDescriptor.toolId,
    error: {
      code,
      message,
      boundary,
      publicSafe: true,
      safeForRuntimeInspection: true,
      internalDetailExposed: false,
    },
    audit: [auditEvent("agentCore.basicTool.search.nativeSearch.rejected", context, provider, { code })],
    events: ["basicTool.search.nativeSearch.rejected"],
  };
}

function cleanStringList(
  value: unknown,
  code: NativeSearchErrorCode,
  message: string,
  boundary: NativeSearchErrorBoundary,
  context?: NativeSearchContext,
): readonly string[] | NativeSearchResult {
  if (value === undefined) {
    return [];
  }
  if (!Array.isArray(value)) {
    return failure(code, message, boundary, context);
  }

  const normalized: string[] = [];
  for (const item of value) {
    if (typeof item !== "string") {
      return failure(code, message, boundary, context);
    }
    const trimmed = item.trim().toLowerCase();
    if (trimmed.length === 0) {
      continue;
    }
    if (trimmed.includes("\0")) {
      return failure(code, message, boundary, context);
    }
    normalized.push(trimmed);
  }
  return [...new Set(normalized)];
}

function normalizeContext(value: unknown): NativeSearchContext | NativeSearchResult {
  if (value === undefined) {
    return {};
  }
  if (!isRecord(value)) {
    return failure("INVALID_CONTEXT", "search.nativeSearch context must be an object when provided", "input");
  }

  const guardValue = value.guard;
  let guard: NativeSearchGate | undefined;
  if (guardValue !== undefined) {
    if (!isRecord(guardValue)) {
      return failure("INVALID_CONTEXT", "search.nativeSearch context.guard must be an object when provided", "input");
    }
    const reason = stringValue(guardValue.reason);
    guard = {
      accepted: booleanValue(guardValue.accepted),
      allowed: booleanValue(guardValue.allowed),
      ...(reason !== undefined ? { reason } : {}),
    };
  }

  const allowedProvidersRaw = cleanStringList(
    value.allowedProviders,
    "INVALID_CONTEXT",
    "search.nativeSearch context.allowedProviders must be a provider string array",
    "input",
  );
  if ("ok" in allowedProvidersRaw) {
    return allowedProvidersRaw;
  }
  const allowedProviders: NativeSearchProvider[] = [];
  for (const provider of allowedProvidersRaw) {
    if (!isProvider(provider)) {
      return failure("INVALID_CONTEXT", "search.nativeSearch context.allowedProviders contains an unsupported provider", "input");
    }
    allowedProviders.push(provider);
  }

  const permissions = cleanStringList(
    value.grantedPermissions,
    "INVALID_CONTEXT",
    "search.nativeSearch context.grantedPermissions must be a permission string array",
    "input",
  );
  if ("ok" in permissions) {
    return permissions;
  }

  const auditMetadata = isRecord(value.auditMetadata) ? value.auditMetadata : undefined;
  if (value.auditMetadata !== undefined && auditMetadata === undefined) {
    return failure("INVALID_CONTEXT", "search.nativeSearch context.auditMetadata must be an object when provided", "input");
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
    return failure("INVALID_CONTEXT", "search.nativeSearch context has invalid scalar fields", "input");
  }

  return {
    ...(runtimeId !== undefined ? { runtimeId } : {}),
    ...(sessionId !== undefined ? { sessionId } : {}),
    ...(invocation !== undefined ? { invocationId: invocation } : {}),
    ...(dryRun !== undefined ? { dryRun } : {}),
    ...(guard !== undefined ? { guard } : {}),
    allowedProviders,
    grantedPermissions: permissions as readonly NativeSearchPermission[],
    ...(auditMetadata !== undefined ? { auditMetadata } : {}),
  };
}

function normalizeUserLocation(
  value: unknown,
  context: NativeSearchContext,
  provider: NativeSearchProvider,
): NativeSearchUserLocation | NativeSearchResult | undefined {
  if (value === undefined) {
    return undefined;
  }
  if (!isRecord(value)) {
    return failure("INVALID_USER_LOCATION", "search.nativeSearch userLocation must be an object", "input", context, provider);
  }

  const location: NativeSearchUserLocation = {};
  for (const key of ["city", "region", "country", "timezone"] as const) {
    const item = value[key];
    if (item === undefined) {
      continue;
    }
    if (typeof item !== "string" || item.trim().length === 0 || item.includes("\0")) {
      return failure("INVALID_USER_LOCATION", `search.nativeSearch userLocation.${key} must be a non-empty string`, "input", context, provider);
    }
    location[key] = item.trim();
  }
  return Object.keys(location).length === 0 ? undefined : location;
}

function normalizeTarget(value: unknown, context: NativeSearchContext): NativeSearchTarget | NativeSearchResult {
  if (value !== undefined && !isRecord(value)) {
    return failure("INVALID_REQUEST", "search.nativeSearch target must be an object when provided", "input", context);
  }
  const target = isRecord(value) ? value : {};

  const rawProvider = stringValue(target.provider)?.trim();
  if (rawProvider === undefined || rawProvider.length === 0) {
    return failure("MISSING_PROVIDER", "search.nativeSearch requires target.provider", "input", context);
  }
  if (!isProvider(rawProvider)) {
    return failure("INVALID_PROVIDER", "search.nativeSearch target.provider must be openai, anthropic, or deepmind", "input", context);
  }

  const rawQuery = target.query;
  if (rawQuery === undefined) {
    return failure("MISSING_QUERY", "search.nativeSearch requires target.query", "input", context, rawProvider);
  }
  if (typeof rawQuery !== "string") {
    return failure("INVALID_QUERY", "search.nativeSearch target.query must be a string", "input", context, rawProvider);
  }
  const query = rawQuery.trim();
  if (query.length === 0 || query.includes("\0")) {
    return failure("MISSING_QUERY", "search.nativeSearch requires a non-empty safe target.query", "input", context, rawProvider);
  }

  const model = target.model === undefined ? undefined : stringValue(target.model)?.trim();
  if (target.model !== undefined && (model === undefined || model.length === 0 || model.includes("\0"))) {
    return failure("INVALID_MODEL", "search.nativeSearch target.model must be a non-empty string when provided", "input", context, rawProvider);
  }

  const maxResults = target.maxResults === undefined ? defaultMaxResults : target.maxResults;
  if (typeof maxResults !== "number" || !Number.isInteger(maxResults) || maxResults < 1 || maxResults > maxResultLimit) {
    return failure(
      "INVALID_MAX_RESULTS",
      `search.nativeSearch maxResults must be an integer between 1 and ${maxResultLimit}`,
      "resource",
      context,
      rawProvider,
    );
  }

  const recencyDays = target.recencyDays;
  if (recencyDays !== undefined && (typeof recencyDays !== "number" || !Number.isInteger(recencyDays) || recencyDays < 1)) {
    return failure("INVALID_RECENCY", "search.nativeSearch recencyDays must be a positive integer", "input", context, rawProvider);
  }

  const freshness = target.freshness === undefined ? undefined : stringValue(target.freshness)?.trim();
  if (freshness !== undefined && !isFreshness(freshness)) {
    return failure("INVALID_FRESHNESS", "search.nativeSearch freshness must be any, day, week, month, or year", "input", context, rawProvider);
  }

  const allowedDomains = cleanStringList(
    target.allowedDomains,
    "INVALID_ALLOWED_DOMAIN",
    "search.nativeSearch allowedDomains must be a domain string array",
    "input",
    context,
  );
  if ("ok" in allowedDomains) {
    return allowedDomains;
  }
  if (allowedDomains.some((domain) => domain.includes("/") || domain.includes(":"))) {
    return failure("INVALID_ALLOWED_DOMAIN", "search.nativeSearch allowedDomains must contain domain names only", "input", context, rawProvider);
  }
  if (allowedDomains.length > maxDomainCount) {
    return failure("INVALID_ALLOWED_DOMAIN", `search.nativeSearch accepts at most ${maxDomainCount} allowed domains`, "resource", context, rawProvider);
  }

  const searchContextSize = target.searchContextSize === undefined ? undefined : stringValue(target.searchContextSize)?.trim();
  if (searchContextSize !== undefined && !isContextSize(searchContextSize)) {
    return failure("INVALID_SEARCH_CONTEXT_SIZE", "search.nativeSearch searchContextSize must be low, medium, or high", "input", context, rawProvider);
  }

  const citations = target.citations === undefined ? "required" : stringValue(target.citations)?.trim();
  if (citations === undefined || !isCitationMode(citations)) {
    return failure("INVALID_CITATIONS", "search.nativeSearch citations must be required, preferred, or off", "input", context, rawProvider);
  }

  const userLocation = normalizeUserLocation(target.userLocation, context, rawProvider);
  if (userLocation !== undefined && "ok" in userLocation) {
    return userLocation;
  }

  return {
    provider: rawProvider,
    query,
    ...(model !== undefined ? { model } : {}),
    maxResults,
    ...(recencyDays !== undefined ? { recencyDays } : {}),
    ...(freshness !== undefined ? { freshness } : {}),
    allowedDomains,
    ...(searchContextSize !== undefined ? { searchContextSize } : {}),
    ...(userLocation !== undefined ? { userLocation } : {}),
    citations,
  };
}

function normalizeRequest(request: unknown): NormalizedRequest | NativeSearchResult {
  if (request === undefined) {
    request = {};
  }
  if (!isRecord(request)) {
    return failure("INVALID_REQUEST", "search.nativeSearch request must be an object", "input");
  }

  const context = normalizeContext(request.context);
  if ("ok" in context) {
    return context;
  }

  const target = normalizeTarget(request.target, context);
  if ("ok" in target) {
    return target;
  }

  const metadata = request.metadata;
  if (metadata !== undefined && !isRecord(metadata)) {
    return failure("INVALID_REQUEST", "search.nativeSearch metadata must be an object when provided", "input", context, target.provider);
  }

  const executor = request.executor ?? request.provider;
  if (executor !== undefined && typeof executor !== "function") {
    return failure("INVALID_REQUEST", "search.nativeSearch executor must be a function when provided", "input", context, target.provider);
  }

  return {
    target,
    context,
    executor: executor as NativeSearchExecutor | undefined,
    metadata: metadata ?? {},
  };
}

function ensureProviderAllowed(target: NativeSearchTarget, context: NativeSearchContext): NativeSearchResult | undefined {
  const allowedProviders = context.allowedProviders ?? [];
  if (allowedProviders.length === 0 || allowedProviders.includes(target.provider)) {
    return undefined;
  }

  return failure(
    "PROVIDER_NOT_ALLOWED",
    "search.nativeSearch target.provider is outside runtime governance",
    "scope",
    context,
    target.provider,
  );
}

function ensurePermissions(target: NativeSearchTarget, context: NativeSearchContext): NativeSearchResult | undefined {
  if (context.grantedPermissions === undefined || context.grantedPermissions.length === 0) {
    return dryRunEnabled(context)
      ? undefined
      : failure(
          "PERMISSION_DENIED",
          `search.nativeSearch is missing permissions: ${nativeSearchDescriptor.permissionsRequired.join(", ")}`,
          "permission",
          context,
          target.provider,
        );
  }

  const granted = new Set(context.grantedPermissions);
  const missing = nativeSearchDescriptor.permissionsRequired.filter((permission) => !granted.has(permission));
  if (missing.length === 0) {
    return undefined;
  }

  return failure(
    "PERMISSION_DENIED",
    `search.nativeSearch is missing permissions: ${missing.join(", ")}`,
    "permission",
    context,
    target.provider,
  );
}

function ensureGovernance(target: NativeSearchTarget, context: NativeSearchContext): NativeSearchResult | undefined {
  if (dryRunEnabled(context)) {
    return undefined;
  }
  if (context.guard?.accepted === true || context.guard?.allowed === true) {
    return undefined;
  }
  return failure(
    "GOVERNANCE_REJECTED",
    context.guard?.reason ?? "search.nativeSearch real execution requires an affirmative runtime guard",
    "governance",
    context,
    target.provider,
  );
}

function dryRunResult(request: NormalizedRequest): NativeSearchResult {
  return {
    ok: true,
    toolId: nativeSearchDescriptor.toolId,
    output: {
      kind: "agentCore.basicTool.search.nativeSearch",
      target: request.target,
      requestPreview: request.target,
      dispatch: "dry-run",
      dryRun: true,
      executionBlocked: true,
      permissionsRequired: nativeSearchDescriptor.permissionsRequired,
      unsafeSideEffects: false,
      resultEnvelope: {
        query: request.target.query,
        sources: [],
        citations: [],
      },
    },
    audit: [
      auditEvent("agentCore.basicTool.search.nativeSearch.dryRun", request.context, request.target.provider, {
        target: request.target,
        ...request.metadata,
      }),
    ],
    events: ["basicTool.search.nativeSearch.dryRun"],
  };
}

function providerUnavailable(request: NormalizedRequest): NativeSearchResult {
  return failure(
    "PROVIDER_UNAVAILABLE",
    "search.nativeSearch real execution requires BaseToolExecutorPort.network.nativeWebSearch or an injected provider-native web search executor",
    "provider",
    request.context,
    request.target.provider,
  );
}

function normalizeSource(source: NativeSearchSource): NativeSearchSource | undefined {
  if (!source || typeof source.url !== "string") {
    return undefined;
  }
  const url = source.url.trim();
  if (url.length === 0) {
    return undefined;
  }
  return {
    url,
    ...(typeof source.title === "string" && source.title.trim().length > 0 ? { title: source.title.trim() } : {}),
    ...(typeof source.snippet === "string" && source.snippet.trim().length > 0 ? { snippet: source.snippet.trim() } : {}),
    ...(source.kind !== undefined ? { kind: source.kind } : {}),
    ...(source.raw !== undefined ? { raw: source.raw } : {}),
  };
}

function normalizeCitation(citation: NativeSearchCitation): NativeSearchCitation | undefined {
  if (!citation || typeof citation.url !== "string") {
    return undefined;
  }
  const url = citation.url.trim();
  if (url.length === 0) {
    return undefined;
  }
  return {
    url,
    ...(typeof citation.title === "string" && citation.title.trim().length > 0 ? { title: citation.title.trim() } : {}),
    ...(typeof citation.snippet === "string" && citation.snippet.trim().length > 0 ? { snippet: citation.snippet.trim() } : {}),
    ...(typeof citation.providerReference === "string" && citation.providerReference.trim().length > 0
      ? { providerReference: citation.providerReference.trim() }
      : {}),
    ...(citation.raw !== undefined ? { raw: citation.raw } : {}),
  };
}

function normalizeExecutionOutput(request: NormalizedRequest, execution: NativeSearchExecution): NativeSearchResult {
  if (!Array.isArray(execution.sources)) {
    return failure("PROVIDER_RESULT_INVALID", "search.nativeSearch provider returned invalid sources", "provider", request.context, request.target.provider);
  }

  const sources = execution.sources.map(normalizeSource).filter((source): source is NativeSearchSource => source !== undefined);
  const citations = (execution.citations ?? [])
    .map(normalizeCitation)
    .filter((citation): citation is NativeSearchCitation => citation !== undefined);

  return {
    ok: true,
    toolId: nativeSearchDescriptor.toolId,
    output: {
      kind: "agentCore.basicTool.search.nativeSearch",
      target: request.target,
      requestPreview: request.target,
      dispatch: "provider-native",
      dryRun: false,
      executionBlocked: false,
      permissionsRequired: nativeSearchDescriptor.permissionsRequired,
      unsafeSideEffects: false,
      resultEnvelope: {
        query: request.target.query,
        ...(typeof execution.answer === "string" ? { answer: execution.answer } : {}),
        sources,
        citations,
        ...(execution.providerMetadata !== undefined ? { providerMetadata: execution.providerMetadata } : {}),
        ...(execution.raw !== undefined ? { raw: execution.raw } : {}),
      },
    },
    audit: [
      auditEvent("agentCore.basicTool.search.nativeSearch.executed", request.context, request.target.provider, {
        sourceCount: sources.length,
        citationCount: citations.length,
        ...request.metadata,
      }),
    ],
    events: ["basicTool.search.nativeSearch.executed"],
  };
}

export async function planNativeSearch(request: NativeSearchRequest = {}): Promise<NativeSearchResult> {
  const normalized = normalizeRequest(request);
  if ("ok" in normalized) {
    return normalized;
  }

  const providerAllowedFailure = ensureProviderAllowed(normalized.target, normalized.context);
  if (providerAllowedFailure !== undefined) {
    return providerAllowedFailure;
  }

  const permissionFailure = ensurePermissions(normalized.target, normalized.context);
  if (permissionFailure !== undefined) {
    return permissionFailure;
  }

  const governanceFailure = ensureGovernance(normalized.target, normalized.context);
  if (governanceFailure !== undefined) {
    return governanceFailure;
  }

  if (dryRunEnabled(normalized.context)) {
    return dryRunResult(normalized);
  }

  if (normalized.executor === undefined) {
    return providerUnavailable(normalized);
  }

  try {
    const execution = await normalized.executor({
      provider: normalized.target.provider,
      query: normalized.target.query,
      model: normalized.target.model,
      maxResults: normalized.target.maxResults,
      recencyDays: normalized.target.recencyDays,
      freshness: normalized.target.freshness,
      allowedDomains: normalized.target.allowedDomains,
      searchContextSize: normalized.target.searchContextSize,
      userLocation: normalized.target.userLocation,
      citations: normalized.target.citations,
      context: normalized.context,
    });
    return normalizeExecutionOutput(normalized, execution);
  } catch {
    return failure(
      "PROVIDER_REJECTED",
      "search.nativeSearch provider rejected the request",
      "provider",
      normalized.context,
      normalized.target.provider,
    );
  }
}

export const executeNativeSearch = planNativeSearch;
