/*
 * 文件定位：Agent 执行引擎 / 基础工具原语层 / 基础工具集合 / MCP 基础工具 / MCP 工具登记。
 * 核心目的：提供 MCP 基础工具 / MCP 工具登记 中的“注销工具”基础能力原语。
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
  normalizeMcpToolName,
  type McpToolRegistryContext,
  type McpToolRegistryPermission,
  type McpToolRegistryResult,
} from "./mcp.registerTool.js";

export type UnregisterMcpToolTarget = {
  serverId: string;
  toolName: string;
  keepAuditRecord?: boolean;
};

export type UnregisterMcpToolRequest = {
  target?: Partial<UnregisterMcpToolTarget>;
  context?: McpToolRegistryContext;
};

export type UnregisterMcpToolOutput = {
  kind: "agentCore.basicTool.mcp.unregisterTool";
  target: UnregisterMcpToolTarget;
  dryRun: true;
  executionBlocked: true;
  permissionsRequired: readonly McpToolRegistryPermission[];
  unsafeSideEffects: true;
};

export const mcpUnregisterToolDescriptor = {
  toolId: "mcp.unregisterTool",
  capability: "unregister-mcp-tool",
  route: "agent_executionEngine.basic_toolLayer.baseTools.mcpBase.tool",
  permissionsRequired: ["mcp:tool:read", "mcp:tool:write"],
  defaultDryRun: true,
  unsafeSideEffects: true,
  tapOwnsApproval: true,
} as const;

function normalizeUnregisterTarget(
  target: UnregisterMcpToolRequest["target"],
  context: McpToolRegistryContext | undefined,
): UnregisterMcpToolTarget | McpToolRegistryResult<UnregisterMcpToolOutput> {
  const toolId = mcpUnregisterToolDescriptor.toolId;
  const serverId = normalizeMcpServerId(toolId, target?.serverId, context);
  if (typeof serverId !== "string") {
    return serverId;
  }

  const toolName = normalizeMcpToolName(toolId, target?.toolName, context, serverId);
  if (typeof toolName !== "string") {
    return toolName;
  }

  return {
    serverId,
    toolName,
    keepAuditRecord: target?.keepAuditRecord !== false,
  };
}

export function planMcpToolUnregistration(
  request: UnregisterMcpToolRequest = {},
): McpToolRegistryResult<UnregisterMcpToolOutput> {
  const toolId = mcpUnregisterToolDescriptor.toolId;
  const target = normalizeUnregisterTarget(request.target, request.context);
  if ("ok" in target) {
    return target;
  }

  const scopeFailure = ensureMcpToolRegistryScope<UnregisterMcpToolOutput>(toolId, target.serverId, request.context);
  if (scopeFailure !== undefined) {
    return scopeFailure;
  }

  const permissionFailure = ensureMcpToolRegistryPermissions<UnregisterMcpToolOutput>(
    toolId,
    mcpUnregisterToolDescriptor.permissionsRequired,
    request.context,
    target.serverId,
  );
  if (permissionFailure !== undefined) {
    return permissionFailure;
  }

  const realExecutionFailure = blockMcpToolRegistryRealExecution<UnregisterMcpToolOutput>(
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
      kind: "agentCore.basicTool.mcp.unregisterTool",
      target,
      dryRun: true,
      executionBlocked: true,
      permissionsRequired: mcpUnregisterToolDescriptor.permissionsRequired,
      unsafeSideEffects: true,
    },
    audit: [
      createMcpToolRegistryAuditEvent(toolId, "agentCore.basicTool.mcp.unregisterTool.dryRun", request.context, target.serverId, {
        toolName: target.toolName,
        keepAuditRecord: target.keepAuditRecord,
      }),
    ],
    events: ["basicTool.mcp.unregisterTool.dryRun"],
  };
}
