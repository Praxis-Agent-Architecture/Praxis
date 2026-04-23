/*
 * 文件定位：Agent 执行引擎 / 基础工具原语层 / 基础工具集合 / MCP 基础工具 / MCP 鉴权。
 * 核心目的：提供 MCP 基础工具 / MCP 鉴权 中的“完成授权”基础能力原语。
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
} from "./mcp.authenticate.js";

export type McpAuthorizeAction = "call-tool" | "read-resource" | "subscribe" | "cache-access";

export type McpAuthorizeTarget = {
  serverId: string;
  subjectId: string;
  action: McpAuthorizeAction;
  toolName?: string;
  resourceUri?: string;
  requestedScopes?: readonly string[];
};

export type McpAuthorizeRequest = {
  target?: Partial<McpAuthorizeTarget>;
  context?: McpToolContext;
};

export type McpAuthorizeOutput = {
  kind: "agentCore.basicTool.mcp.authorize";
  target: McpAuthorizeTarget;
  dryRun: true;
  executionBlocked: true;
  permissionsRequired: readonly McpToolPermission[];
  authorizationGranted: false;
  decision: "dry-run-policy-envelope";
  policyInput: {
    serverId: string;
    subjectId: string;
    action: McpAuthorizeAction;
    toolName?: string;
    resourceUri?: string;
    requestedScopes: readonly string[];
  };
};

export const mcpAuthorizeDescriptor = {
  toolId: "mcp.authorize",
  capability: "authorize-mcp-operation",
  route: "agent_executionEngine.basic_toolLayer.baseTools.mcpBase.auth",
  permissionsRequired: ["mcp:auth", "mcp:read"],
  defaultDryRun: true,
  tapOwnsApproval: true,
} as const;

function normalizeAuthorizeAction(action: string | undefined): McpAuthorizeAction | undefined {
  if (action === "call-tool" || action === "read-resource" || action === "subscribe" || action === "cache-access") {
    return action;
  }

  return undefined;
}

function normalizeAuthorizeTarget(
  target: Partial<McpAuthorizeTarget> | undefined,
  context: McpToolContext | undefined,
): McpAuthorizeTarget | McpToolResult<McpAuthorizeOutput> {
  const toolId = mcpAuthorizeDescriptor.toolId;
  const serverId = normalizeMcpServerId(toolId, target?.serverId, context);
  if (typeof serverId !== "string") {
    return serverId;
  }

  const subjectId = target?.subjectId?.trim() ?? "";
  if (subjectId.length === 0) {
    return createMcpToolFailure(
      toolId,
      "MISSING_SUBJECT_ID",
      `${toolId} requires target.subjectId`,
      "input",
      context,
      serverId,
    );
  }

  const action = normalizeAuthorizeAction(target?.action);
  if (action === undefined) {
    return createMcpToolFailure(
      toolId,
      "MISSING_AUTH_ACTION",
      `${toolId} requires target.action to be call-tool, read-resource, subscribe, or cache-access`,
      "input",
      context,
      serverId,
    );
  }

  return {
    serverId,
    subjectId,
    action,
    toolName: target?.toolName?.trim() || undefined,
    resourceUri: target?.resourceUri?.trim() || undefined,
    requestedScopes: cleanMcpList(target?.requestedScopes),
  };
}

export function planMcpAuthorize(request: McpAuthorizeRequest = {}): McpToolResult<McpAuthorizeOutput> {
  const toolId = mcpAuthorizeDescriptor.toolId;
  const target = normalizeAuthorizeTarget(request.target, request.context);
  if ("ok" in target) {
    return target;
  }

  const scopeFailure = ensureMcpServerScope<McpAuthorizeOutput>(toolId, target.serverId, request.context);
  if (scopeFailure !== undefined) {
    return scopeFailure;
  }

  const permissionFailure = ensureMcpToolPermissions<McpAuthorizeOutput>(
    toolId,
    mcpAuthorizeDescriptor.permissionsRequired,
    request.context,
    target.serverId,
  );
  if (permissionFailure !== undefined) {
    return permissionFailure;
  }

  const realExecutionFailure = blockRealMcpExecution<McpAuthorizeOutput>(toolId, request.context, target.serverId);
  if (realExecutionFailure !== undefined) {
    return realExecutionFailure;
  }

  const requestedScopes = target.requestedScopes ?? [];

  return {
    ok: true,
    toolId,
    output: {
      kind: "agentCore.basicTool.mcp.authorize",
      target,
      dryRun: true,
      executionBlocked: true,
      permissionsRequired: mcpAuthorizeDescriptor.permissionsRequired,
      authorizationGranted: false,
      decision: "dry-run-policy-envelope",
      policyInput: {
        serverId: target.serverId,
        subjectId: target.subjectId,
        action: target.action,
        toolName: target.toolName,
        resourceUri: target.resourceUri,
        requestedScopes,
      },
    },
    audit: [
      createMcpAuditEvent(toolId, "agentCore.basicTool.mcp.authorize.dryRun", request.context, target.serverId, {
        subjectId: target.subjectId,
        action: target.action,
        requestedScopeCount: requestedScopes.length,
      }),
    ],
    events: ["basicTool.mcp.authorize.dryRun"],
  };
}
