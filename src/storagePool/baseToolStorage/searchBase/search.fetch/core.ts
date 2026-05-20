/*
 * 文件定位：Agent 执行引擎 / 基础工具原语层 / 基础工具集合 / 搜索基础工具。
 * 核心目的：提供 基础工具集合 / 搜索基础工具 中的“抓取网页或远端内容”基础能力原语。
 * 能力要求1：需要定义该能力的输入、输出、错误、权限需求和可观测事件。
 * 能力要求2：这些基础工具是 Agent 成立的底层能力，不是 TAP 的最终高级工具库。
 * 能力要求3：后续 TAP 可以基于这些原语构建更强的工具编排、审批、替换和专业能力库。
 * 边界：保留 Agent 基础工具原语，不替代 TAP 的高级工具系统。
 * 对接：需要被 runtime.execEngine 拉起，并和 mainLoop、stateEngine、事件暴露、工具调用策略接通。
 * 实现提示：先补稳定类型契约、最小可测行为和清晰错误边界，再接入真实执行逻辑。
 */

export type SearchFetchPermission = "network:read" | "search:fetch";
export type SearchFetchBoundary = "input" | "scope" | "permission" | "resource" | "governance" | "provider";
export type SearchFetchMethod = "GET" | "HEAD";

export type SearchFetchGate = {
  accepted?: boolean;
  allowed?: boolean;
  reason?: string;
};

export type SearchFetchContext = {
  runtimeId?: string;
  sessionId?: string;
  invocationId?: string;
  dryRun?: boolean;
  guard?: SearchFetchGate;
  networkAccess?: SearchFetchGate;
  grantedPermissions?: readonly SearchFetchPermission[];
  allowedDomains?: readonly string[];
  auditMetadata?: Readonly<Record<string, unknown>>;
};

export type SearchFetchTarget = {
  url: string;
  method: SearchFetchMethod;
  expectedContentType?: string;
  maxBytes: number;
  timeoutMs?: number;
};

export type SearchFetchExecution = {
  status: number;
  headers: Readonly<Record<string, string>>;
  body: string;
  finalUrl?: string;
};

export type SearchFetchExecutor = (request: {
  url: string;
  method: SearchFetchMethod;
  expectedContentType?: string;
  maxBytes?: number;
  timeoutMs?: number;
  context?: SearchFetchContext;
}) => SearchFetchExecution | Promise<SearchFetchExecution>;

export type SearchFetchRequest = {
  target?: Partial<SearchFetchTarget>;
  context?: SearchFetchContext;
  executor?: SearchFetchExecutor;
  provider?: SearchFetchExecutor;
  metadata?: Readonly<Record<string, unknown>>;
  url?: string;
  method?: SearchFetchMethod;
  expectedContentType?: string;
  maxBytes?: number;
  timeoutMs?: number;
};

export type SearchFetchErrorCode =
  | "INVALID_REQUEST"
  | "INVALID_CONTEXT"
  | "MISSING_URL"
  | "INVALID_URL"
  | "UNSUPPORTED_PROTOCOL"
  | "DOMAIN_NOT_ALLOWED"
  | "INVALID_METHOD"
  | "INVALID_EXPECTED_CONTENT_TYPE"
  | "INVALID_MAX_BYTES"
  | "INVALID_TIMEOUT"
  | "PERMISSION_DENIED"
  | "GOVERNANCE_REJECTED"
  | "PROVIDER_UNAVAILABLE"
  | "PROVIDER_REJECTED"
  | "PROVIDER_RESULT_INVALID";

export type SearchFetchError = {
  code: SearchFetchErrorCode;
  message: string;
  boundary: SearchFetchBoundary;
  publicSafe: true;
  safeForRuntimeInspection: true;
  internalDetailExposed: false;
};

export type SearchFetchAuditEvent = {
  type: string;
  toolId: "search.fetch";
  invocationId: string;
  dryRun: boolean;
  url?: string;
  metadata: Readonly<Record<string, unknown>>;
};

export type SearchFetchOutput = {
  kind: "agentCore.basicTool.search.fetch";
  target: SearchFetchTarget;
  requestPreview: SearchFetchTarget;
  dispatch: "dry-run" | "runtime-fetch";
  dryRun: boolean;
  executionBlocked: boolean;
  permissionsRequired: readonly SearchFetchPermission[];
  unsafeSideEffects: false;
  resultEnvelope: {
    url: string;
    finalUrl?: string;
    status?: number;
    headers: Readonly<Record<string, string>>;
    bodyPreview: string;
    bytesRead: number;
    truncated: boolean;
    contentType?: string;
  };
};

export type SearchFetchResult =
  | {
      ok: true;
      toolId: "search.fetch";
      output: SearchFetchOutput;
      audit: readonly SearchFetchAuditEvent[];
      events: readonly string[];
    }
  | {
      ok: false;
      toolId: "search.fetch";
      error: SearchFetchError;
      audit: readonly SearchFetchAuditEvent[];
      events: readonly string[];
    };

export const searchFetchDescriptor = {
  toolId: "search.fetch",
  capability: "fetch-remote-content",
  route: "agent_executionEngine.basic_toolLayer.baseTools.searchBase",
  defaultDryRun: true,
  defaultMethod: "GET",
  defaultMaxBytes: 1_048_576,
  permissionsRequired: ["network:read", "search:fetch"],
  tapOwnsApproval: true,
  unsafeSideEffects: false,
} as const;

const maxFetchBytes = 10_485_760;
const maxTimeoutMs = 120_000;

type NormalizedRequest = {
  target: SearchFetchTarget;
  context: SearchFetchContext;
  executor?: SearchFetchExecutor;
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

function dryRunEnabled(context: SearchFetchContext | undefined): boolean {
  return context?.dryRun !== false;
}

function invocationId(context: SearchFetchContext | undefined): string {
  return context?.invocationId?.trim() || "search.fetch:dry-run";
}

function auditEvent(
  type: string,
  context: SearchFetchContext | undefined,
  url?: string,
  metadata?: Readonly<Record<string, unknown>>,
): SearchFetchAuditEvent {
  return {
    type,
    toolId: searchFetchDescriptor.toolId,
    invocationId: invocationId(context),
    dryRun: dryRunEnabled(context),
    url,
    metadata: {
      ...(context?.auditMetadata ?? {}),
      ...(metadata ?? {}),
    },
  };
}

function failure(
  code: SearchFetchErrorCode,
  message: string,
  boundary: SearchFetchBoundary,
  context?: SearchFetchContext,
  url?: string,
): SearchFetchResult {
  return {
    ok: false,
    toolId: searchFetchDescriptor.toolId,
    error: {
      code,
      message,
      boundary,
      publicSafe: true,
      safeForRuntimeInspection: true,
      internalDetailExposed: false,
    },
    audit: [auditEvent("agentCore.basicTool.search.fetch.rejected", context, url, { code })],
    events: ["basicTool.search.fetch.rejected"],
  };
}

function cleanStringList(value: unknown, message: string, context?: SearchFetchContext): readonly string[] | SearchFetchResult {
  if (value === undefined) {
    return [];
  }
  if (!Array.isArray(value)) {
    return failure("INVALID_CONTEXT", message, "input", context);
  }
  const normalized: string[] = [];
  for (const item of value) {
    if (typeof item !== "string" || item.includes("\0")) {
      return failure("INVALID_CONTEXT", message, "input", context);
    }
    const trimmed = item.trim().toLowerCase();
    if (trimmed.length > 0) normalized.push(trimmed);
  }
  return [...new Set(normalized)];
}

function normalizeGate(value: unknown, label: string): SearchFetchGate | SearchFetchResult | undefined {
  if (value === undefined) return undefined;
  if (!isRecord(value)) {
    return failure("INVALID_CONTEXT", `search.fetch context.${label} must be an object when provided`, "input");
  }
  const reason = stringValue(value.reason);
  return {
    accepted: booleanValue(value.accepted),
    allowed: booleanValue(value.allowed),
    ...(reason !== undefined ? { reason } : {}),
  };
}

function normalizeContext(value: unknown): SearchFetchContext | SearchFetchResult {
  if (value === undefined) return {};
  if (!isRecord(value)) {
    return failure("INVALID_CONTEXT", "search.fetch context must be an object when provided", "input");
  }
  const guard = normalizeGate(value.guard, "guard");
  if (guard !== undefined && "ok" in guard) return guard;
  const networkAccess = normalizeGate(value.networkAccess, "networkAccess");
  if (networkAccess !== undefined && "ok" in networkAccess) return networkAccess;
  const grantedPermissions = cleanStringList(value.grantedPermissions, "search.fetch context.grantedPermissions must be a string array");
  if ("ok" in grantedPermissions) return grantedPermissions;
  const allowedDomains = cleanStringList(value.allowedDomains, "search.fetch context.allowedDomains must be a domain string array");
  if ("ok" in allowedDomains) return allowedDomains;
  if (allowedDomains.some((domain) => domain.includes("/") || domain.includes(":"))) {
    return failure("INVALID_CONTEXT", "search.fetch context.allowedDomains must contain domain names only", "input");
  }
  const auditMetadata = isRecord(value.auditMetadata) ? value.auditMetadata : undefined;
  if (value.auditMetadata !== undefined && auditMetadata === undefined) {
    return failure("INVALID_CONTEXT", "search.fetch context.auditMetadata must be an object when provided", "input");
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
    return failure("INVALID_CONTEXT", "search.fetch context has invalid scalar fields", "input");
  }
  return {
    ...(runtimeId !== undefined ? { runtimeId } : {}),
    ...(sessionId !== undefined ? { sessionId } : {}),
    ...(invocation !== undefined ? { invocationId: invocation } : {}),
    ...(dryRun !== undefined ? { dryRun } : {}),
    ...(guard !== undefined ? { guard } : {}),
    ...(networkAccess !== undefined ? { networkAccess } : {}),
    grantedPermissions: grantedPermissions as readonly SearchFetchPermission[],
    allowedDomains,
    ...(auditMetadata !== undefined ? { auditMetadata } : {}),
  };
}

function normalizeUrl(value: unknown, context: SearchFetchContext): { url: string; hostname: string; origin: string } | SearchFetchResult {
  if (typeof value !== "string" || value.trim().length === 0) {
    return failure("MISSING_URL", "search.fetch requires target.url", "input", context);
  }
  const rawUrl = value.trim();
  if (rawUrl.includes("\0")) {
    return failure("INVALID_URL", "search.fetch url must be a safe string", "input", context);
  }
  let parsed: URL;
  try {
    parsed = new URL(rawUrl);
  } catch {
    return failure("INVALID_URL", "search.fetch url must be an absolute URL", "input", context);
  }
  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
    return failure("UNSUPPORTED_PROTOCOL", "search.fetch only accepts http and https URLs", "scope", context, parsed.toString());
  }
  return { url: parsed.toString(), hostname: parsed.hostname.toLowerCase(), origin: parsed.origin };
}

function normalizeTarget(value: unknown, request: Record<string, unknown>, context: SearchFetchContext): SearchFetchTarget | SearchFetchResult {
  if (value !== undefined && !isRecord(value)) {
    return failure("INVALID_REQUEST", "search.fetch target must be an object when provided", "input", context);
  }
  const target = isRecord(value) ? value : {};
  const normalizedUrl = normalizeUrl(target.url ?? request.url, context);
  if ("ok" in normalizedUrl) return normalizedUrl;
  const allowedDomains = context.allowedDomains ?? [];
  if (allowedDomains.length > 0 && !allowedDomains.includes(normalizedUrl.hostname)) {
    return failure("DOMAIN_NOT_ALLOWED", "search.fetch target domain is outside runtime governance", "scope", context, normalizedUrl.url);
  }
  const rawMethod = stringValue(target.method ?? request.method)?.trim().toUpperCase() || searchFetchDescriptor.defaultMethod;
  if (rawMethod !== "GET" && rawMethod !== "HEAD") {
    return failure("INVALID_METHOD", "search.fetch method must be GET or HEAD", "input", context, normalizedUrl.url);
  }
  const expectedContentType = target.expectedContentType ?? request.expectedContentType;
  const contentType = expectedContentType === undefined ? undefined : stringValue(expectedContentType)?.trim().toLowerCase();
  if (expectedContentType !== undefined && (contentType === undefined || contentType.length === 0 || contentType.includes("\0") || !contentType.includes("/"))) {
    return failure("INVALID_EXPECTED_CONTENT_TYPE", "search.fetch expectedContentType must be a media type such as text/html", "input", context, normalizedUrl.url);
  }
  const maxBytes = target.maxBytes ?? request.maxBytes ?? searchFetchDescriptor.defaultMaxBytes;
  if (typeof maxBytes !== "number" || !Number.isInteger(maxBytes) || maxBytes <= 0 || maxBytes > maxFetchBytes) {
    return failure("INVALID_MAX_BYTES", "search.fetch maxBytes must be between 1 and 10485760", "resource", context, normalizedUrl.url);
  }
  const timeoutMs = target.timeoutMs ?? request.timeoutMs;
  if (timeoutMs !== undefined && (typeof timeoutMs !== "number" || !Number.isInteger(timeoutMs) || timeoutMs <= 0 || timeoutMs > maxTimeoutMs)) {
    return failure("INVALID_TIMEOUT", "search.fetch timeoutMs must be a positive integer no larger than 120000", "resource", context, normalizedUrl.url);
  }
  return {
    url: normalizedUrl.url,
    method: rawMethod,
    ...(contentType !== undefined ? { expectedContentType: contentType } : {}),
    maxBytes,
    ...(timeoutMs !== undefined ? { timeoutMs } : {}),
  };
}

function normalizeRequest(request: unknown): NormalizedRequest | SearchFetchResult {
  if (request === undefined) request = {};
  if (!isRecord(request)) {
    return failure("INVALID_REQUEST", "search.fetch request must be an object", "input");
  }
  const context = normalizeContext(request.context);
  if ("ok" in context) return context;
  const target = normalizeTarget(request.target, request, context);
  if ("ok" in target) return target;
  const metadata = request.metadata;
  if (metadata !== undefined && !isRecord(metadata)) {
    return failure("INVALID_REQUEST", "search.fetch metadata must be an object when provided", "input", context, target.url);
  }
  const executor = request.executor ?? request.provider;
  if (executor !== undefined && typeof executor !== "function") {
    return failure("INVALID_REQUEST", "search.fetch executor must be a function when provided", "input", context, target.url);
  }
  return { target, context, executor: executor as SearchFetchExecutor | undefined, metadata: metadata ?? {} };
}

function ensurePermissions(target: SearchFetchTarget, context: SearchFetchContext): SearchFetchResult | undefined {
  if (context.grantedPermissions === undefined || context.grantedPermissions.length === 0) {
    return dryRunEnabled(context)
      ? undefined
      : failure("PERMISSION_DENIED", `search.fetch is missing permissions: ${searchFetchDescriptor.permissionsRequired.join(", ")}`, "permission", context, target.url);
  }
  const granted = new Set(context.grantedPermissions);
  const missing = searchFetchDescriptor.permissionsRequired.filter((permission) => !granted.has(permission));
  return missing.length === 0
    ? undefined
    : failure("PERMISSION_DENIED", `search.fetch is missing permissions: ${missing.join(", ")}`, "permission", context, target.url);
}

function ensureGovernance(target: SearchFetchTarget, context: SearchFetchContext): SearchFetchResult | undefined {
  if (dryRunEnabled(context)) return undefined;
  if (context.guard?.accepted === true || context.guard?.allowed === true || context.networkAccess?.accepted === true || context.networkAccess?.allowed === true) {
    return undefined;
  }
  return failure(
    "GOVERNANCE_REJECTED",
    context.guard?.reason ?? context.networkAccess?.reason ?? "search.fetch real execution requires an affirmative runtime guard",
    "governance",
    context,
    target.url,
  );
}

function dryRunResult(request: NormalizedRequest): SearchFetchResult {
  return {
    ok: true,
    toolId: searchFetchDescriptor.toolId,
    output: {
      kind: "agentCore.basicTool.search.fetch",
      target: request.target,
      requestPreview: request.target,
      dispatch: "dry-run",
      dryRun: true,
      executionBlocked: true,
      permissionsRequired: searchFetchDescriptor.permissionsRequired,
      unsafeSideEffects: false,
      resultEnvelope: {
        url: request.target.url,
        headers: {},
        bodyPreview: "",
        bytesRead: 0,
        truncated: false,
      },
    },
    audit: [auditEvent("agentCore.basicTool.search.fetch.dryRun", request.context, request.target.url, request.metadata)],
    events: ["basicTool.search.fetch.dryRun"],
  };
}

function providerUnavailable(request: NormalizedRequest): SearchFetchResult {
  return failure(
    "PROVIDER_UNAVAILABLE",
    "search.fetch real execution requires BaseToolExecutorPort.network.fetch or an injected fetch provider",
    "provider",
    request.context,
    request.target.url,
  );
}

function normalizeExecutionOutput(request: NormalizedRequest, execution: SearchFetchExecution): SearchFetchResult {
  if (typeof execution.status !== "number" || !isRecord(execution.headers) || typeof execution.body !== "string") {
    return failure("PROVIDER_RESULT_INVALID", "search.fetch provider returned an invalid response envelope", "provider", request.context, request.target.url);
  }
  let finalUrl = execution.finalUrl;
  if (finalUrl !== undefined) {
    if (typeof finalUrl !== "string" || finalUrl.trim().length === 0 || finalUrl.includes("\0")) {
      return failure("PROVIDER_RESULT_INVALID", "search.fetch provider returned an invalid final URL", "provider", request.context, request.target.url);
    }
    let parsedFinalUrl: URL;
    try {
      parsedFinalUrl = new URL(finalUrl.trim());
    } catch {
      return failure("PROVIDER_RESULT_INVALID", "search.fetch provider returned an invalid final URL", "provider", request.context, request.target.url);
    }
    if (parsedFinalUrl.protocol !== "http:" && parsedFinalUrl.protocol !== "https:") {
      return failure("PROVIDER_RESULT_INVALID", "search.fetch provider returned an unsupported final URL protocol", "provider", request.context, request.target.url);
    }
    const allowedDomains = request.context.allowedDomains ?? [];
    if (allowedDomains.length > 0 && !allowedDomains.includes(parsedFinalUrl.hostname.toLowerCase())) {
      return failure("DOMAIN_NOT_ALLOWED", "search.fetch final URL domain is outside runtime governance", "scope", request.context, request.target.url);
    }
    finalUrl = parsedFinalUrl.toString();
  }
  const contentType = Object.entries(execution.headers).find(([key]) => key.toLowerCase() === "content-type")?.[1];
  if (request.target.expectedContentType !== undefined && typeof contentType === "string" && !contentType.toLowerCase().includes(request.target.expectedContentType)) {
    return failure("PROVIDER_RESULT_INVALID", "search.fetch provider returned an unexpected content type", "provider", request.context, request.target.url);
  }
  const bodyBytes = Buffer.byteLength(execution.body, "utf8");
  let bodyPreview = execution.body;
  while (Buffer.byteLength(bodyPreview, "utf8") > request.target.maxBytes) {
    bodyPreview = bodyPreview.slice(0, -1);
  }
  return {
    ok: true,
    toolId: searchFetchDescriptor.toolId,
    output: {
      kind: "agentCore.basicTool.search.fetch",
      target: request.target,
      requestPreview: request.target,
      dispatch: "runtime-fetch",
      dryRun: false,
      executionBlocked: false,
      permissionsRequired: searchFetchDescriptor.permissionsRequired,
      unsafeSideEffects: false,
      resultEnvelope: {
        url: request.target.url,
        ...(finalUrl !== undefined ? { finalUrl } : {}),
        status: execution.status,
        headers: execution.headers,
        bodyPreview,
        bytesRead: Math.min(bodyBytes, request.target.maxBytes),
        truncated: bodyBytes > request.target.maxBytes,
        ...(typeof contentType === "string" ? { contentType } : {}),
      },
    },
    audit: [auditEvent("agentCore.basicTool.search.fetch.executed", request.context, request.target.url, request.metadata)],
    events: ["basicTool.search.fetch.executed"],
  };
}

export async function planSearchFetch(request: SearchFetchRequest = {}): Promise<SearchFetchResult> {
  const normalized = normalizeRequest(request);
  if ("ok" in normalized) return normalized;
  const permissionFailure = ensurePermissions(normalized.target, normalized.context);
  if (permissionFailure !== undefined) return permissionFailure;
  const governanceFailure = ensureGovernance(normalized.target, normalized.context);
  if (governanceFailure !== undefined) return governanceFailure;
  if (dryRunEnabled(normalized.context)) return dryRunResult(normalized);
  if (normalized.executor === undefined) return providerUnavailable(normalized);
  try {
    return normalizeExecutionOutput(
      normalized,
      await normalized.executor({
        url: normalized.target.url,
        method: normalized.target.method,
        expectedContentType: normalized.target.expectedContentType,
        maxBytes: normalized.target.maxBytes,
        timeoutMs: normalized.target.timeoutMs,
        context: normalized.context,
      }),
    );
  } catch {
    return failure("PROVIDER_REJECTED", "search.fetch provider rejected the request", "provider", normalized.context, normalized.target.url);
  }
}

export const executeSearchFetch = planSearchFetch;
