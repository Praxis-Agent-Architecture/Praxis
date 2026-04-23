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

export type SearchFetchBoundary = "input" | "contract" | "governance" | "scope" | "resource" | "permission";

export type SearchFetchGate = {
  accepted: boolean;
  reason?: string;
};

export type SearchFetchMethod = "GET" | "HEAD";

export type SearchFetchContext = {
  runtimeId?: string;
  invocationId?: string;
  dryRun?: boolean;
  networkAccess?: SearchFetchGate;
  guard?: SearchFetchGate;
  requestedScopes?: readonly string[];
  allowedScopes?: readonly string[];
  auditMetadata?: Readonly<Record<string, unknown>>;
};

export type SearchFetchRequest = {
  context?: SearchFetchContext;
  url?: string;
  method?: SearchFetchMethod;
  expectedContentType?: string;
  maxBytes?: number;
  metadata?: Readonly<Record<string, unknown>>;
};

export type SearchFetchErrorCode =
  | "MISSING_RUNTIME_ID"
  | "MISSING_URL"
  | "INVALID_URL"
  | "UNSUPPORTED_PROTOCOL"
  | "INVALID_EXPECTED_CONTENT_TYPE"
  | "INVALID_MAX_BYTES"
  | "NETWORK_PERMISSION_REQUIRED"
  | "GOVERNANCE_REJECTED"
  | "SCOPE_DENIED"
  | "REAL_NETWORK_FETCH_NOT_ALLOWED";

export type SearchFetchError = {
  code: SearchFetchErrorCode;
  message: string;
  boundary: SearchFetchBoundary;
  safeForRuntimeInspection: true;
  internalDetailExposed: false;
};

export type SearchFetchPlan = {
  toolId: "search.fetch";
  capability: "fetch-remote-content";
  runtimeId: string;
  invocationId: string;
  url: string;
  origin: string;
  method: SearchFetchMethod;
  expectedContentType?: string;
  maxBytes: number;
  requiredPermissions: readonly ["network:read:dry-run"];
  requiresTapApproval: true;
  dispatch: "dry-run";
  dryRun: true;
  wouldFetchNetworkContent: true;
  unsafeSideEffects: false;
  acceptedScopes: readonly string[];
  outputEnvelope: {
    statusCode?: number;
    headers: Readonly<Record<string, string>>;
    bodyPreview: "";
    bytesRead: 0;
  };
  audit: {
    guard: "search-fetch-network-approval";
    event: "basicTool.search.fetch.planned";
    metadata: Readonly<Record<string, unknown>>;
  };
};

export type SearchFetchResult =
  | {
      ok: true;
      plan: SearchFetchPlan;
      events: readonly string[];
    }
  | {
      ok: false;
      error: SearchFetchError;
      events: readonly string[];
    };

export const searchFetchDescriptor = {
  toolId: "search.fetch",
  capability: "fetch-remote-content",
  layer: "agent_executionEngine.basic_toolLayer.baseTools.searchBase",
  defaultDispatch: "dry-run",
  defaultMethod: "GET",
  defaultMaxBytes: 1_048_576,
  unsafeSideEffects: false,
  requiresTapApproval: true,
} as const;

const MAX_FETCH_BYTES = 10_485_760;

function isBlank(value: string | undefined): boolean {
  return typeof value !== "string" || value.trim().length === 0;
}

function cleanList(values: readonly string[] | undefined): string[] {
  return [...new Set((values ?? []).map((value) => value.trim()).filter(Boolean))];
}

function failure(code: SearchFetchErrorCode, message: string, boundary: SearchFetchBoundary): SearchFetchResult {
  return {
    ok: false,
    error: {
      code,
      message,
      boundary,
      safeForRuntimeInspection: true,
      internalDetailExposed: false,
    },
    events: ["basicTool.search.fetch.rejected"],
  };
}

function normalizeUrl(value: string | undefined): { url: string; origin: string } | SearchFetchResult {
  if (typeof value !== "string" || value.trim().length === 0) {
    return failure("MISSING_URL", "search.fetch requires url", "input");
  }

  const normalized = value.trim();
  if (normalized.includes("\0")) {
    return failure("INVALID_URL", "search.fetch url must be a safe string", "input");
  }

  let parsed: URL;
  try {
    parsed = new URL(normalized);
  } catch {
    return failure("INVALID_URL", "search.fetch url must be an absolute URL", "input");
  }

  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
    return failure("UNSUPPORTED_PROTOCOL", "search.fetch only accepts http and https URLs", "scope");
  }

  return {
    url: parsed.toString(),
    origin: parsed.origin,
  };
}

function normalizeExpectedContentType(value: string | undefined): string | SearchFetchResult | undefined {
  if (value === undefined) {
    return undefined;
  }

  const normalized = value.trim().toLowerCase();
  if (normalized.length === 0 || normalized.includes("\0") || !normalized.includes("/")) {
    return failure(
      "INVALID_EXPECTED_CONTENT_TYPE",
      "search.fetch expectedContentType must be a media type such as text/html",
      "input",
    );
  }

  return normalized;
}

function resolveScopes(
  requestedScopes: readonly string[] | undefined,
  allowedScopes: readonly string[] | undefined,
): string[] | SearchFetchResult {
  const requested = cleanList(requestedScopes);
  const allowed = cleanList(allowedScopes);
  const denied = requested.filter((scope) => !allowed.includes(scope));

  if (denied.length > 0) {
    return failure("SCOPE_DENIED", `search.fetch scope ${denied[0]} is outside runtime governance`, "scope");
  }

  return requested;
}

export function planSearchFetch(request: SearchFetchRequest = {}): SearchFetchResult {
  const runtimeId = request.context?.runtimeId?.trim();
  if (isBlank(runtimeId)) {
    return failure("MISSING_RUNTIME_ID", "search.fetch requires context.runtimeId for audit", "input");
  }

  if (request.context?.dryRun === false) {
    return failure(
      "REAL_NETWORK_FETCH_NOT_ALLOWED",
      "first-round search.fetch only creates a dry-run network fetch plan",
      "contract",
    );
  }

  if (request.context?.networkAccess?.accepted !== true) {
    return failure(
      "NETWORK_PERMISSION_REQUIRED",
      request.context?.networkAccess?.reason ?? "search.fetch requires an approved network access gate",
      "permission",
    );
  }

  if (request.context?.guard?.accepted === false) {
    return failure(
      "GOVERNANCE_REJECTED",
      request.context.guard.reason ?? "search.fetch was rejected by runtime governance",
      "governance",
    );
  }

  const normalizedUrl = normalizeUrl(request.url);
  if ("ok" in normalizedUrl) {
    return normalizedUrl;
  }

  const expectedContentType = normalizeExpectedContentType(request.expectedContentType);
  if (expectedContentType !== undefined && typeof expectedContentType !== "string") {
    return expectedContentType;
  }

  const maxBytes = request.maxBytes ?? searchFetchDescriptor.defaultMaxBytes;
  if (!Number.isInteger(maxBytes) || maxBytes <= 0 || maxBytes > MAX_FETCH_BYTES) {
    return failure("INVALID_MAX_BYTES", "search.fetch maxBytes must be between 1 and 10485760", "resource");
  }

  const acceptedScopes = resolveScopes(request.context?.requestedScopes, request.context?.allowedScopes);
  if (!Array.isArray(acceptedScopes)) {
    return acceptedScopes;
  }

  const invocationId = request.context?.invocationId?.trim() || `${runtimeId}:search.fetch:${normalizedUrl.origin}`;

  return {
    ok: true,
    plan: {
      toolId: "search.fetch",
      capability: "fetch-remote-content",
      runtimeId: runtimeId ?? "",
      invocationId,
      url: normalizedUrl.url,
      origin: normalizedUrl.origin,
      method: request.method ?? searchFetchDescriptor.defaultMethod,
      expectedContentType,
      maxBytes,
      requiredPermissions: ["network:read:dry-run"],
      requiresTapApproval: true,
      dispatch: "dry-run",
      dryRun: true,
      wouldFetchNetworkContent: true,
      unsafeSideEffects: false,
      acceptedScopes,
      outputEnvelope: {
        headers: {},
        bodyPreview: "",
        bytesRead: 0,
      },
      audit: {
        guard: "search-fetch-network-approval",
        event: "basicTool.search.fetch.planned",
        metadata: {
          ...(request.context?.auditMetadata ?? {}),
          ...(request.metadata ?? {}),
        },
      },
    },
    events: ["basicTool.search.fetch.planned"],
  };
}
