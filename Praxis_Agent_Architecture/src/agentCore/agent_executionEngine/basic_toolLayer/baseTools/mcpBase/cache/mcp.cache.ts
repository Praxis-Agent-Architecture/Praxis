/*
 * 文件定位：Agent 执行引擎 / 基础工具原语层 / 基础工具集合 / MCP 基础工具 / MCP 缓存。
 * 核心目的：提供 MCP 基础工具 / MCP 缓存 中的“缓存 MCP 数据”基础能力原语。
 * 能力要求1：需要定义该能力的输入、输出、错误、权限需求和可观测事件。
 * 能力要求2：这些基础工具是 Agent 成立的底层能力，不是 TAP 的最终高级工具库。
 * 能力要求3：后续 TAP 可以基于这些原语构建更强的工具编排、审批、替换和专业能力库。
 * 边界：保留 Agent 基础工具原语，不替代 TAP 的高级工具系统。
 * 对接：需要被 runtime.execEngine 拉起，并和 mainLoop、stateEngine、事件暴露、工具调用策略接通。
 * 实现提示：先补稳定类型契约、最小可测行为和清晰错误边界，再接入真实执行逻辑。
 */

import {
  blockRealMcpExecution,
  cleanMcpList,
  createMcpAuditEvent,
  createMcpToolFailure,
  ensureMcpServerScope,
  ensureMcpToolPermissions,
  normalizeMcpServerId,
  type McpToolContext,
  type McpToolPermission,
  type McpToolResult,
} from "../auth/mcp.authenticate.js";

export type McpCacheTarget = {
  serverId: string;
  cacheKey: string;
  valueRef: string;
  ttlSeconds?: number;
  tags?: readonly string[];
};

export type McpCacheRequest = {
  target?: Partial<McpCacheTarget>;
  context?: McpToolContext;
};

export type McpCacheOutput = {
  kind: "agentCore.basicTool.mcp.cache";
  target: McpCacheTarget;
  dryRun: true;
  executionBlocked: true;
  permissionsRequired: readonly McpToolPermission[];
  writesCache: false;
  cachePlan: {
    serverId: string;
    cacheKey: string;
    valueRef: string;
    ttlSeconds?: number;
    tags: readonly string[];
  };
};

export const mcpCacheDescriptor = {
  toolId: "mcp.cache",
  capability: "cache-mcp-data",
  route: "agent_executionEngine.basic_toolLayer.baseTools.mcpBase.cache",
  permissionsRequired: ["mcp:read", "mcp:write", "cache:write"],
  defaultDryRun: true,
  tapOwnsApproval: true,
} as const;

function normalizeTtlSeconds(
  ttlSeconds: number | undefined,
  context: McpToolContext | undefined,
  serverId: string,
): number | undefined | McpToolResult<McpCacheOutput> {
  if (ttlSeconds === undefined) {
    return undefined;
  }

  if (!Number.isInteger(ttlSeconds) || ttlSeconds <= 0) {
    return createMcpToolFailure(
      mcpCacheDescriptor.toolId,
      "INVALID_CACHE_TTL",
      "mcp.cache target.ttlSeconds must be a positive integer when provided",
      "input",
      context,
      serverId,
    );
  }

  return ttlSeconds;
}

function normalizeCacheTarget(
  target: Partial<McpCacheTarget> | undefined,
  context: McpToolContext | undefined,
): McpCacheTarget | McpToolResult<McpCacheOutput> {
  const toolId = mcpCacheDescriptor.toolId;
  const serverId = normalizeMcpServerId(toolId, target?.serverId, context);
  if (typeof serverId !== "string") {
    return serverId;
  }

  const cacheKey = target?.cacheKey?.trim() ?? "";
  if (cacheKey.length === 0) {
    return createMcpToolFailure(toolId, "MISSING_CACHE_KEY", `${toolId} requires target.cacheKey`, "input", context, serverId);
  }

  const valueRef = target?.valueRef?.trim() ?? "";
  if (valueRef.length === 0) {
    return createMcpToolFailure(
      toolId,
      "MISSING_CACHE_VALUE_REF",
      `${toolId} requires target.valueRef instead of embedding cache data`,
      "input",
      context,
      serverId,
    );
  }

  const ttlSeconds = normalizeTtlSeconds(target?.ttlSeconds, context, serverId);
  if (typeof ttlSeconds === "object" && ttlSeconds !== null) {
    return ttlSeconds;
  }

  return {
    serverId,
    cacheKey,
    valueRef,
    ttlSeconds,
    tags: cleanMcpList(target?.tags),
  };
}

export function planMcpCache(request: McpCacheRequest = {}): McpToolResult<McpCacheOutput> {
  const toolId = mcpCacheDescriptor.toolId;
  const target = normalizeCacheTarget(request.target, request.context);
  if ("ok" in target) {
    return target;
  }

  const scopeFailure = ensureMcpServerScope<McpCacheOutput>(toolId, target.serverId, request.context);
  if (scopeFailure !== undefined) {
    return scopeFailure;
  }

  const permissionFailure = ensureMcpToolPermissions<McpCacheOutput>(
    toolId,
    mcpCacheDescriptor.permissionsRequired,
    request.context,
    target.serverId,
  );
  if (permissionFailure !== undefined) {
    return permissionFailure;
  }

  const realExecutionFailure = blockRealMcpExecution<McpCacheOutput>(toolId, request.context, target.serverId);
  if (realExecutionFailure !== undefined) {
    return realExecutionFailure;
  }

  const tags = target.tags ?? [];

  return {
    ok: true,
    toolId,
    output: {
      kind: "agentCore.basicTool.mcp.cache",
      target,
      dryRun: true,
      executionBlocked: true,
      permissionsRequired: mcpCacheDescriptor.permissionsRequired,
      writesCache: false,
      cachePlan: {
        serverId: target.serverId,
        cacheKey: target.cacheKey,
        valueRef: target.valueRef,
        ttlSeconds: target.ttlSeconds,
        tags,
      },
    },
    audit: [
      createMcpAuditEvent(toolId, "agentCore.basicTool.mcp.cache.dryRun", request.context, target.serverId, {
        cacheKey: target.cacheKey,
        ttlSeconds: target.ttlSeconds,
        tagCount: tags.length,
        writesCache: false,
      }),
    ],
    events: ["basicTool.mcp.cache.dryRun"],
  };
}
