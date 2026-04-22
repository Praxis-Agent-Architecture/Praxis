/*
 * 文件定位：Agent 执行引擎 / 基础工具原语层 / 基础工具集合 / MCP 基础工具 / MCP 工具登记。
 * 核心目的：提供 MCP 基础工具 / MCP 工具登记 中的“列出工具”基础能力原语。
 * 能力要求1：需要定义该能力的输入、输出、错误、权限需求和可观测事件。
 * 能力要求2：这些基础工具是 Agent 成立的底层能力，不是 TAP 的最终高级工具库。
 * 能力要求3：后续 TAP 可以基于这些原语构建更强的工具编排、审批、替换和专业能力库。
 * 边界：保留 Agent 基础工具原语，不替代 TAP 的高级工具系统。
 * 对接：需要被 runtime.execEngine 拉起，并和 mainLoop、stateEngine、事件暴露、工具调用策略接通。
 * 实现提示：先补稳定类型契约、最小可测行为和清晰错误边界，再接入真实执行逻辑。
 */

import {
  blockMcpToolRegistryRealExecution,
  createMcpToolRegistryAuditEvent,
  ensureMcpToolRegistryPermissions,
  ensureMcpToolRegistryScope,
  normalizeMcpServerId,
  type McpToolDefinition,
  type McpToolRegistryContext,
  type McpToolRegistryPermission,
  type McpToolRegistryResult,
} from "./mcp.registerTool.js";

export type ListMcpToolsTarget = {
  serverId: string;
  namespace?: string;
  includeDisabled?: boolean;
};

export type ListMcpToolsRequest = {
  target?: Partial<ListMcpToolsTarget>;
  context?: McpToolRegistryContext;
};

export type ListMcpToolsOutput = {
  kind: "agentCore.basicTool.mcp.listTools";
  target: ListMcpToolsTarget;
  toolsPreview: readonly McpToolDefinition[];
  dryRun: true;
  executionBlocked: true;
  permissionsRequired: readonly McpToolRegistryPermission[];
  unsafeSideEffects: false;
};

export const mcpListToolsDescriptor = {
  toolId: "mcp.listTools",
  capability: "list-mcp-tools",
  route: "agent_executionEngine.basic_toolLayer.baseTools.mcpBase.tool",
  permissionsRequired: ["mcp:tool:read"],
  defaultDryRun: true,
  unsafeSideEffects: false,
  tapOwnsApproval: true,
} as const;

function normalizeListTarget(
  target: ListMcpToolsRequest["target"],
  context: McpToolRegistryContext | undefined,
): ListMcpToolsTarget | McpToolRegistryResult<ListMcpToolsOutput> {
  const toolId = mcpListToolsDescriptor.toolId;
  const serverId = normalizeMcpServerId(toolId, target?.serverId, context);
  if (typeof serverId !== "string") {
    return serverId;
  }

  return {
    serverId,
    namespace: target?.namespace?.trim() || undefined,
    includeDisabled: target?.includeDisabled === true,
  };
}

export function planMcpToolsList(request: ListMcpToolsRequest = {}): McpToolRegistryResult<ListMcpToolsOutput> {
  const toolId = mcpListToolsDescriptor.toolId;
  const target = normalizeListTarget(request.target, request.context);
  if ("ok" in target) {
    return target;
  }

  const scopeFailure = ensureMcpToolRegistryScope<ListMcpToolsOutput>(toolId, target.serverId, request.context);
  if (scopeFailure !== undefined) {
    return scopeFailure;
  }

  const permissionFailure = ensureMcpToolRegistryPermissions<ListMcpToolsOutput>(
    toolId,
    mcpListToolsDescriptor.permissionsRequired,
    request.context,
    target.serverId,
  );
  if (permissionFailure !== undefined) {
    return permissionFailure;
  }

  const realExecutionFailure = blockMcpToolRegistryRealExecution<ListMcpToolsOutput>(
    toolId,
    request.context,
    target.serverId,
  );
  if (realExecutionFailure !== undefined) {
    return realExecutionFailure;
  }

  return {
    ok: true,
    toolId,
    output: {
      kind: "agentCore.basicTool.mcp.listTools",
      target,
      toolsPreview: [],
      dryRun: true,
      executionBlocked: true,
      permissionsRequired: mcpListToolsDescriptor.permissionsRequired,
      unsafeSideEffects: false,
    },
    audit: [
      createMcpToolRegistryAuditEvent(toolId, "agentCore.basicTool.mcp.listTools.dryRun", request.context, target.serverId, {
        namespace: target.namespace,
        includeDisabled: target.includeDisabled,
      }),
    ],
    events: ["basicTool.mcp.listTools.dryRun"],
  };
}
