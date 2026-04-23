/*
 * 文件定位：Agent 执行引擎 / 基础工具原语层 / 基础工具集合 / MCP 基础工具 / MCP 工具登记。
 * 核心目的：提供 MCP 基础工具 / MCP 工具登记 中的“更新工具定义”基础能力原语。
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
  createMcpToolRegistryFailure,
  ensureMcpToolRegistryPermissions,
  ensureMcpToolRegistryScope,
  normalizeMcpServerId,
  normalizeMcpToolName,
  type McpToolDefinition,
  type McpToolRegistryContext,
  type McpToolRegistryPermission,
  type McpToolRegistryResult,
} from "./mcp.registerTool.js";

export type UpdateMcpToolPatch = Partial<Omit<McpToolDefinition, "name">> & {
  name?: string;
};

export type UpdateMcpToolTarget = {
  serverId: string;
  toolName: string;
  patch: UpdateMcpToolPatch;
};

export type UpdateMcpToolRequest = {
  target?: {
    serverId?: string;
    toolName?: string;
    patch?: UpdateMcpToolPatch;
  };
  context?: McpToolRegistryContext;
};

export type UpdateMcpToolOutput = {
  kind: "agentCore.basicTool.mcp.updateTool";
  target: UpdateMcpToolTarget;
  dryRun: true;
  executionBlocked: true;
  permissionsRequired: readonly McpToolRegistryPermission[];
  unsafeSideEffects: true;
};

export const mcpUpdateToolDescriptor = {
  toolId: "mcp.updateTool",
  capability: "update-mcp-tool-definition",
  route: "agent_executionEngine.basic_toolLayer.baseTools.mcpBase.tool",
  permissionsRequired: ["mcp:tool:read", "mcp:tool:write"],
  defaultDryRun: true,
  unsafeSideEffects: true,
  tapOwnsApproval: true,
} as const;

function isObjectPatch(patch: UpdateMcpToolPatch | undefined): patch is UpdateMcpToolPatch {
  return patch !== undefined && patch !== null && typeof patch === "object" && Object.keys(patch).length > 0;
}

function normalizeUpdatePatch(
  patch: UpdateMcpToolPatch | undefined,
  context: McpToolRegistryContext | undefined,
  serverId: string,
): UpdateMcpToolPatch | McpToolRegistryResult<UpdateMcpToolOutput> {
  const toolId = mcpUpdateToolDescriptor.toolId;
  if (!isObjectPatch(patch)) {
    return createMcpToolRegistryFailure(
      toolId,
      "MISSING_UPDATE_PATCH",
      `${toolId} requires a non-empty target.patch`,
      "input",
      context,
      serverId,
    );
  }

  return {
    name: patch.name?.trim() || undefined,
    description: patch.description?.trim() || undefined,
    inputSchema: patch.inputSchema,
    outputSchema: patch.outputSchema,
    metadata: patch.metadata,
  };
}

function normalizeUpdateTarget(
  target: UpdateMcpToolRequest["target"],
  context: McpToolRegistryContext | undefined,
): UpdateMcpToolTarget | McpToolRegistryResult<UpdateMcpToolOutput> {
  const toolId = mcpUpdateToolDescriptor.toolId;
  const serverId = normalizeMcpServerId(toolId, target?.serverId, context);
  if (typeof serverId !== "string") {
    return serverId;
  }

  const toolName = normalizeMcpToolName(toolId, target?.toolName, context, serverId);
  if (typeof toolName !== "string") {
    return toolName;
  }

  const patch = normalizeUpdatePatch(target?.patch, context, serverId);
  if ("ok" in patch) {
    return patch;
  }

  return {
    serverId,
    toolName,
    patch,
  };
}

export function planMcpToolUpdate(request: UpdateMcpToolRequest = {}): McpToolRegistryResult<UpdateMcpToolOutput> {
  const toolId = mcpUpdateToolDescriptor.toolId;
  const target = normalizeUpdateTarget(request.target, request.context);
  if ("ok" in target) {
    return target;
  }

  const scopeFailure = ensureMcpToolRegistryScope<UpdateMcpToolOutput>(toolId, target.serverId, request.context);
  if (scopeFailure !== undefined) {
    return scopeFailure;
  }

  const permissionFailure = ensureMcpToolRegistryPermissions<UpdateMcpToolOutput>(
    toolId,
    mcpUpdateToolDescriptor.permissionsRequired,
    request.context,
    target.serverId,
  );
  if (permissionFailure !== undefined) {
    return permissionFailure;
  }

  const realExecutionFailure = blockMcpToolRegistryRealExecution<UpdateMcpToolOutput>(
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
      kind: "agentCore.basicTool.mcp.updateTool",
      target,
      dryRun: true,
      executionBlocked: true,
      permissionsRequired: mcpUpdateToolDescriptor.permissionsRequired,
      unsafeSideEffects: true,
    },
    audit: [
      createMcpToolRegistryAuditEvent(toolId, "agentCore.basicTool.mcp.updateTool.dryRun", request.context, target.serverId, {
        toolName: target.toolName,
        patchKeys: Object.keys(target.patch),
      }),
    ],
    events: ["basicTool.mcp.updateTool.dryRun"],
  };
}
