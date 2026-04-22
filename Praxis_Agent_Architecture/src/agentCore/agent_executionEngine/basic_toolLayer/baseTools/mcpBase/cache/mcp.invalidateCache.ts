/*
 * 文件定位：Agent 执行引擎 / 基础工具原语层 / 基础工具集合 / MCP 基础工具 / MCP 缓存。
 * 核心目的：提供 MCP 基础工具 / MCP 缓存 中的“失效缓存”基础能力原语。
 * 能力要求1：需要定义该能力的输入、输出、错误、权限需求和可观测事件。
 * 能力要求2：这些基础工具是 Agent 成立的底层能力，不是 TAP 的最终高级工具库。
 * 能力要求3：后续 TAP 可以基于这些原语构建更强的工具编排、审批、替换和专业能力库。
 * 边界：保留 Agent 基础工具原语，不替代 TAP 的高级工具系统。
 * 对接：需要被 runtime.execEngine 拉起，并和 mainLoop、stateEngine、事件暴露、工具调用策略接通。
 * 实现提示：先补稳定类型契约、最小可测行为和清晰错误边界，再接入真实执行逻辑。
 */

export type McpInvalidateCacheScope = "server" | "resources" | "tools" | "all";

export type McpInvalidateCachePermission = "mcp:cache:invalidate";

export type McpInvalidateCacheErrorBoundary = "input" | "scope" | "permission" | "contract";

export type McpInvalidateCacheContext = {
  runtimeId?: string;
  invocationId?: string;
  dryRun?: boolean;
  allowedServerIds?: readonly string[];
  grantedPermissions?: readonly McpInvalidateCachePermission[];
  auditMetadata?: Readonly<Record<string, unknown>>;
};

export type McpInvalidateCacheTarget = {
  serverId: string;
  scope: McpInvalidateCacheScope;
  cacheKey?: string;
  reason?: string;
};

export type McpInvalidateCacheRequest = {
  target?: Partial<McpInvalidateCacheTarget>;
  context?: McpInvalidateCacheContext;
};

export type McpInvalidateCacheErrorCode =
  | "MISSING_SERVER_ID"
  | "MISSING_SCOPE"
  | "INVALID_SCOPE"
  | "INVALID_CACHE_KEY"
  | "INVALID_REASON"
  | "SCOPE_REJECTED"
  | "PERMISSION_DENIED"
  | "REAL_EXECUTION_BLOCKED";

export type McpInvalidateCacheError = {
  code: McpInvalidateCacheErrorCode;
  message: string;
  boundary: McpInvalidateCacheErrorBoundary;
  publicSafe: true;
};

export type McpInvalidateCacheAuditEvent = {
  type: string;
  toolId: "mcp.invalidateCache";
  invocationId: string;
  dryRun: boolean;
  serverId?: string;
  metadata: Readonly<Record<string, unknown>>;
};

export type McpCacheInvalidationPlan = {
  serverId: string;
  scope: McpInvalidateCacheScope;
  cacheKey?: string;
  reason?: string;
  invalidationState: "planned";
};

export type McpInvalidateCacheOutput = {
  kind: "agentCore.basicTool.mcp.invalidateCache";
  target: McpInvalidateCacheTarget;
  operationPreview: McpCacheInvalidationPlan;
  dryRun: true;
  executionBlocked: true;
  permissionsRequired: readonly McpInvalidateCachePermission[];
  unsafeSideEffects: true;
};

export type McpInvalidateCacheResult =
  | {
      ok: true;
      toolId: "mcp.invalidateCache";
      output: McpInvalidateCacheOutput;
      audit: readonly McpInvalidateCacheAuditEvent[];
      events: readonly string[];
    }
  | {
      ok: false;
      toolId: "mcp.invalidateCache";
      error: McpInvalidateCacheError;
      audit: readonly McpInvalidateCacheAuditEvent[];
      events: readonly string[];
    };

export const mcpInvalidateCacheDescriptor = {
  toolId: "mcp.invalidateCache",
  capability: "invalidate-mcp-cache",
  route: "agent_executionEngine.basic_toolLayer.baseTools.mcpBase.cache",
  defaultDryRun: true,
  tapOwnsApproval: true,
  permissionsRequired: ["mcp:cache:invalidate"],
} as const;

function cleanList<T extends string>(values: readonly T[] | undefined): readonly T[] {
  return [...new Set((values ?? []).map((value) => value.trim()).filter(Boolean) as T[])];
}

function dryRunEnabled(context: McpInvalidateCacheContext | undefined): boolean {
  return context?.dryRun !== false;
}

function invocationId(context: McpInvalidateCacheContext | undefined): string {
  return context?.invocationId?.trim() || "mcp.invalidateCache:dry-run";
}

function auditEvent(
  type: string,
  context: McpInvalidateCacheContext | undefined,
  serverId?: string,
  metadata?: Readonly<Record<string, unknown>>,
): McpInvalidateCacheAuditEvent {
  return {
    type,
    toolId: mcpInvalidateCacheDescriptor.toolId,
    invocationId: invocationId(context),
    dryRun: dryRunEnabled(context),
    serverId,
    metadata: {
      ...(context?.auditMetadata ?? {}),
      ...(metadata ?? {}),
    },
  };
}

function failure(
  code: McpInvalidateCacheErrorCode,
  message: string,
  boundary: McpInvalidateCacheErrorBoundary,
  context: McpInvalidateCacheContext | undefined,
  serverId?: string,
): McpInvalidateCacheResult {
  return {
    ok: false,
    toolId: mcpInvalidateCacheDescriptor.toolId,
    error: { code, message, boundary, publicSafe: true },
    audit: [auditEvent("agentCore.basicTool.mcp.invalidateCache.rejected", context, serverId, { code })],
    events: ["basicTool.mcp.invalidateCache.rejected"],
  };
}

function isMcpInvalidateCacheScope(value: string): value is McpInvalidateCacheScope {
  return value === "server" || value === "resources" || value === "tools" || value === "all";
}

function normalizeServerId(
  serverId: string | undefined,
  context: McpInvalidateCacheContext | undefined,
): string | McpInvalidateCacheResult {
  const normalized = serverId?.trim() ?? "";
  if (normalized.length === 0) {
    return failure("MISSING_SERVER_ID", "mcp.invalidateCache requires target.serverId", "input", context, serverId);
  }

  return normalized;
}

function normalizeScope(
  scope: string | undefined,
  context: McpInvalidateCacheContext | undefined,
  serverId: string,
): McpInvalidateCacheScope | McpInvalidateCacheResult {
  const normalized = scope?.trim() ?? "";
  if (normalized.length === 0) {
    return failure("MISSING_SCOPE", "mcp.invalidateCache requires target.scope", "input", context, serverId);
  }

  if (!isMcpInvalidateCacheScope(normalized)) {
    return failure(
      "INVALID_SCOPE",
      "mcp.invalidateCache target.scope must be server, resources, tools, or all",
      "input",
      context,
      serverId,
    );
  }

  return normalized;
}

function normalizeCacheKey(
  cacheKey: string | undefined,
  context: McpInvalidateCacheContext | undefined,
  serverId: string,
): string | undefined | McpInvalidateCacheResult {
  const normalized = cacheKey?.trim() ?? "";
  if (normalized.length === 0) {
    return undefined;
  }

  if (normalized.length > 256 || normalized.includes("\0")) {
    return failure(
      "INVALID_CACHE_KEY",
      "mcp.invalidateCache target.cacheKey must be non-binary and at most 256 characters",
      "input",
      context,
      serverId,
    );
  }

  return normalized;
}

function normalizeReason(
  reason: string | undefined,
  context: McpInvalidateCacheContext | undefined,
  serverId: string,
): string | undefined | McpInvalidateCacheResult {
  const normalized = reason?.trim() ?? "";
  if (normalized.length === 0) {
    return undefined;
  }

  if (normalized.length > 256) {
    return failure("INVALID_REASON", "mcp.invalidateCache target.reason must be at most 256 characters", "input", context, serverId);
  }

  return normalized;
}

function ensureScope(serverId: string, context: McpInvalidateCacheContext | undefined): McpInvalidateCacheResult | undefined {
  const allowedServerIds = cleanList(context?.allowedServerIds);
  if (allowedServerIds.length === 0 || allowedServerIds.includes(serverId)) {
    return undefined;
  }

  return failure(
    "SCOPE_REJECTED",
    "mcp.invalidateCache target server is outside allowed MCP server ids",
    "scope",
    context,
    serverId,
  );
}

function ensurePermissions(serverId: string, context: McpInvalidateCacheContext | undefined): McpInvalidateCacheResult | undefined {
  const granted = cleanList(context?.grantedPermissions);
  if (granted.length === 0) {
    return undefined;
  }

  const missing = mcpInvalidateCacheDescriptor.permissionsRequired.filter((permission) => !granted.includes(permission));
  if (missing.length === 0) {
    return undefined;
  }

  return failure(
    "PERMISSION_DENIED",
    `mcp.invalidateCache is missing permissions: ${missing.join(", ")}`,
    "permission",
    context,
    serverId,
  );
}

function ensureDryRunOnly(serverId: string, context: McpInvalidateCacheContext | undefined): McpInvalidateCacheResult | undefined {
  if (dryRunEnabled(context)) {
    return undefined;
  }

  return failure(
    "REAL_EXECUTION_BLOCKED",
    "mcp.invalidateCache only returns a guarded dry-run plan in the first implementation",
    "contract",
    context,
    serverId,
  );
}

function normalizeTarget(
  target: Partial<McpInvalidateCacheTarget> | undefined,
  context: McpInvalidateCacheContext | undefined,
): McpInvalidateCacheTarget | McpInvalidateCacheResult {
  const serverId = normalizeServerId(target?.serverId, context);
  if (typeof serverId !== "string") {
    return serverId;
  }

  const scope = normalizeScope(target?.scope, context, serverId);
  if (typeof scope !== "string") {
    return scope;
  }

  const cacheKey = normalizeCacheKey(target?.cacheKey, context, serverId);
  if (cacheKey !== undefined && typeof cacheKey !== "string") {
    return cacheKey;
  }

  const reason = normalizeReason(target?.reason, context, serverId);
  if (reason !== undefined && typeof reason !== "string") {
    return reason;
  }

  return {
    serverId,
    scope,
    cacheKey,
    reason,
  };
}

function operationPreview(target: McpInvalidateCacheTarget): McpCacheInvalidationPlan {
  return {
    serverId: target.serverId,
    scope: target.scope,
    cacheKey: target.cacheKey,
    reason: target.reason,
    invalidationState: "planned",
  };
}

export function planMcpCacheInvalidation(request: McpInvalidateCacheRequest = {}): McpInvalidateCacheResult {
  const target = normalizeTarget(request.target, request.context);
  if ("ok" in target) {
    return target;
  }

  const scopeFailure = ensureScope(target.serverId, request.context);
  if (scopeFailure !== undefined) {
    return scopeFailure;
  }

  const permissionFailure = ensurePermissions(target.serverId, request.context);
  if (permissionFailure !== undefined) {
    return permissionFailure;
  }

  const realExecutionFailure = ensureDryRunOnly(target.serverId, request.context);
  if (realExecutionFailure !== undefined) {
    return realExecutionFailure;
  }

  return {
    ok: true,
    toolId: mcpInvalidateCacheDescriptor.toolId,
    output: {
      kind: "agentCore.basicTool.mcp.invalidateCache",
      target,
      operationPreview: operationPreview(target),
      dryRun: true,
      executionBlocked: true,
      permissionsRequired: mcpInvalidateCacheDescriptor.permissionsRequired,
      unsafeSideEffects: true,
    },
    audit: [
      auditEvent("agentCore.basicTool.mcp.invalidateCache.dryRun", request.context, target.serverId, {
        scope: target.scope,
        cacheKey: target.cacheKey,
      }),
    ],
    events: ["basicTool.mcp.invalidateCache.dryRun"],
  };
}
