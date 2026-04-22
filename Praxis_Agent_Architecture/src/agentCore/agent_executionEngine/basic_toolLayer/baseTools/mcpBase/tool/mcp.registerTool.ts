/*
 * 文件定位：Agent 执行引擎 / 基础工具原语层 / 基础工具集合 / MCP 基础工具 / MCP 工具登记。
 * 核心目的：提供 MCP 基础工具 / MCP 工具登记 中的“注册工具”基础能力原语。
 * 能力要求1：需要定义该能力的输入、输出、错误、权限需求和可观测事件。
 * 能力要求2：这些基础工具是 Agent 成立的底层能力，不是 TAP 的最终高级工具库。
 * 能力要求3：后续 TAP 可以基于这些原语构建更强的工具编排、审批、替换和专业能力库。
 * 边界：保留 Agent 基础工具原语，不替代 TAP 的高级工具系统。
 * 对接：需要被 runtime.execEngine 拉起，并和 mainLoop、stateEngine、事件暴露、工具调用策略接通。
 * 实现提示：先补稳定类型契约、最小可测行为和清晰错误边界，再接入真实执行逻辑。
 */

export type McpToolRegistryBoundary = "input" | "contract" | "permission" | "scope" | "execution";

export type McpToolRegistryPermission = "mcp:tool:read" | "mcp:tool:write";

export type McpToolRegistryContext = {
  runtimeId?: string;
  invocationId?: string;
  dryRun?: boolean;
  serverId?: string;
  allowedServerIds?: readonly string[];
  grantedPermissions?: readonly McpToolRegistryPermission[];
  auditMetadata?: Readonly<Record<string, unknown>>;
};

export type McpToolDefinition = {
  name: string;
  description?: string;
  inputSchema?: Readonly<Record<string, unknown>>;
  outputSchema?: Readonly<Record<string, unknown>>;
  metadata?: Readonly<Record<string, unknown>>;
};

export type McpToolRegistryAuditEvent = {
  type: string;
  toolId: string;
  invocationId: string;
  dryRun: boolean;
  serverId?: string;
  metadata: Readonly<Record<string, unknown>>;
};

export type McpToolRegistryErrorCode =
  | "MISSING_SERVER_ID"
  | "MISSING_TOOL_NAME"
  | "MISSING_TOOL_DEFINITION"
  | "MISSING_UPDATE_PATCH"
  | "INVALID_TOOL_DEFINITION"
  | "SCOPE_REJECTED"
  | "PERMISSION_DENIED"
  | "REAL_EXECUTION_BLOCKED";

export type McpToolRegistryError = {
  code: McpToolRegistryErrorCode;
  message: string;
  boundary: McpToolRegistryBoundary;
  publicSafe: true;
};

export type McpToolRegistryResult<Output> =
  | {
      ok: true;
      toolId: string;
      output: Output;
      audit: readonly McpToolRegistryAuditEvent[];
      events: readonly string[];
    }
  | {
      ok: false;
      toolId: string;
      error: McpToolRegistryError;
      audit: readonly McpToolRegistryAuditEvent[];
      events: readonly string[];
    };

export type RegisterMcpToolTarget = {
  serverId: string;
  tool: McpToolDefinition;
  replaceExisting?: boolean;
};

export type RegisterMcpToolRequest = {
  target?: {
    serverId?: string;
    tool?: Partial<McpToolDefinition>;
    replaceExisting?: boolean;
  };
  context?: McpToolRegistryContext;
};

export type RegisterMcpToolOutput = {
  kind: "agentCore.basicTool.mcp.registerTool";
  target: RegisterMcpToolTarget;
  dryRun: true;
  executionBlocked: true;
  permissionsRequired: readonly McpToolRegistryPermission[];
  unsafeSideEffects: true;
};

export const mcpRegisterToolDescriptor = {
  toolId: "mcp.registerTool",
  capability: "register-mcp-tool",
  route: "agent_executionEngine.basic_toolLayer.baseTools.mcpBase.tool",
  permissionsRequired: ["mcp:tool:read", "mcp:tool:write"],
  defaultDryRun: true,
  unsafeSideEffects: true,
  tapOwnsApproval: true,
} as const;

export function cleanMcpToolList<T extends string>(values: readonly T[] | undefined): readonly T[] {
  return [...new Set((values ?? []).map((value) => value.trim()).filter(Boolean) as T[])];
}

export function isBlankMcpToolValue(value: string | undefined): boolean {
  return typeof value !== "string" || value.trim().length === 0;
}

export function mcpToolDryRunEnabled(context: McpToolRegistryContext | undefined): boolean {
  return context?.dryRun !== false;
}

export function mcpToolInvocationId(toolId: string, context: McpToolRegistryContext | undefined): string {
  return context?.invocationId?.trim() || `${toolId}:dry-run`;
}

export function createMcpToolRegistryAuditEvent(
  toolId: string,
  type: string,
  context: McpToolRegistryContext | undefined,
  serverId?: string,
  metadata?: Readonly<Record<string, unknown>>,
): McpToolRegistryAuditEvent {
  return {
    type,
    toolId,
    invocationId: mcpToolInvocationId(toolId, context),
    dryRun: mcpToolDryRunEnabled(context),
    serverId,
    metadata: {
      ...(context?.auditMetadata ?? {}),
      ...(metadata ?? {}),
    },
  };
}

export function createMcpToolRegistryFailure<Output>(
  toolId: string,
  code: McpToolRegistryErrorCode,
  message: string,
  boundary: McpToolRegistryBoundary,
  context: McpToolRegistryContext | undefined,
  serverId?: string,
): McpToolRegistryResult<Output> {
  return {
    ok: false,
    toolId,
    error: { code, message, boundary, publicSafe: true },
    audit: [createMcpToolRegistryAuditEvent(toolId, "agentCore.basicTool.mcp.toolRegistry.rejected", context, serverId, { code })],
    events: ["basicTool.mcp.toolRegistry.rejected"],
  };
}

export function normalizeMcpServerId(
  toolId: string,
  serverId: string | undefined,
  context: McpToolRegistryContext | undefined,
): string | McpToolRegistryResult<never> {
  const normalizedServerId = (serverId ?? context?.serverId ?? "").trim();
  if (isBlankMcpToolValue(normalizedServerId)) {
    return createMcpToolRegistryFailure(
      toolId,
      "MISSING_SERVER_ID",
      `${toolId} requires target.serverId or context.serverId`,
      "input",
      context,
      serverId,
    );
  }

  return normalizedServerId;
}

export function normalizeMcpToolName(
  toolId: string,
  name: string | undefined,
  context: McpToolRegistryContext | undefined,
  serverId: string,
): string | McpToolRegistryResult<never> {
  const normalizedName = name?.trim() ?? "";
  if (isBlankMcpToolValue(normalizedName)) {
    return createMcpToolRegistryFailure(
      toolId,
      "MISSING_TOOL_NAME",
      `${toolId} requires target.toolName or target.tool.name`,
      "input",
      context,
      serverId,
    );
  }

  return normalizedName;
}

export function normalizeMcpToolDefinition(
  toolId: string,
  tool: Partial<McpToolDefinition> | undefined,
  context: McpToolRegistryContext | undefined,
  serverId: string,
): McpToolDefinition | McpToolRegistryResult<never> {
  if (tool === undefined) {
    return createMcpToolRegistryFailure(
      toolId,
      "MISSING_TOOL_DEFINITION",
      `${toolId} requires target.tool`,
      "input",
      context,
      serverId,
    );
  }

  const name = normalizeMcpToolName(toolId, tool.name, context, serverId);
  if (typeof name !== "string") {
    return name;
  }

  if (tool.inputSchema !== undefined && (tool.inputSchema === null || typeof tool.inputSchema !== "object")) {
    return createMcpToolRegistryFailure(
      toolId,
      "INVALID_TOOL_DEFINITION",
      `${toolId} target.tool.inputSchema must be an object when provided`,
      "contract",
      context,
      serverId,
    );
  }

  if (tool.outputSchema !== undefined && (tool.outputSchema === null || typeof tool.outputSchema !== "object")) {
    return createMcpToolRegistryFailure(
      toolId,
      "INVALID_TOOL_DEFINITION",
      `${toolId} target.tool.outputSchema must be an object when provided`,
      "contract",
      context,
      serverId,
    );
  }

  return {
    name,
    description: tool.description?.trim() || undefined,
    inputSchema: tool.inputSchema,
    outputSchema: tool.outputSchema,
    metadata: tool.metadata,
  };
}

export function ensureMcpToolRegistryScope<Output>(
  toolId: string,
  serverId: string,
  context: McpToolRegistryContext | undefined,
): McpToolRegistryResult<Output> | undefined {
  const allowedServerIds = cleanMcpToolList(context?.allowedServerIds);
  if (allowedServerIds.length === 0) {
    return undefined;
  }

  if (allowedServerIds.includes(serverId)) {
    return undefined;
  }

  return createMcpToolRegistryFailure(
    toolId,
    "SCOPE_REJECTED",
    `${toolId} target server is outside the allowed MCP server scope`,
    "scope",
    context,
    serverId,
  );
}

export function ensureMcpToolRegistryPermissions<Output>(
  toolId: string,
  permissionsRequired: readonly McpToolRegistryPermission[],
  context: McpToolRegistryContext | undefined,
  serverId: string,
): McpToolRegistryResult<Output> | undefined {
  const granted = cleanMcpToolList(context?.grantedPermissions);
  if (granted.length === 0) {
    return undefined;
  }

  const missing = permissionsRequired.filter((permission) => !granted.includes(permission));
  if (missing.length === 0) {
    return undefined;
  }

  return createMcpToolRegistryFailure(
    toolId,
    "PERMISSION_DENIED",
    `${toolId} is missing permissions: ${missing.join(", ")}`,
    "permission",
    context,
    serverId,
  );
}

export function blockMcpToolRegistryRealExecution<Output>(
  toolId: string,
  context: McpToolRegistryContext | undefined,
  serverId: string,
): McpToolRegistryResult<Output> | undefined {
  if (mcpToolDryRunEnabled(context)) {
    return undefined;
  }

  return createMcpToolRegistryFailure(
    toolId,
    "REAL_EXECUTION_BLOCKED",
    `${toolId} only returns a guarded dry-run plan in the first implementation`,
    "contract",
    context,
    serverId,
  );
}

function normalizeRegisterTarget(
  target: RegisterMcpToolRequest["target"],
  context: McpToolRegistryContext | undefined,
): RegisterMcpToolTarget | McpToolRegistryResult<RegisterMcpToolOutput> {
  const toolId = mcpRegisterToolDescriptor.toolId;
  const serverId = normalizeMcpServerId(toolId, target?.serverId, context);
  if (typeof serverId !== "string") {
    return serverId;
  }

  const tool = normalizeMcpToolDefinition(toolId, target?.tool, context, serverId);
  if ("ok" in tool) {
    return tool;
  }

  return {
    serverId,
    tool,
    replaceExisting: target?.replaceExisting === true,
  };
}

export function planMcpToolRegistration(
  request: RegisterMcpToolRequest = {},
): McpToolRegistryResult<RegisterMcpToolOutput> {
  const toolId = mcpRegisterToolDescriptor.toolId;
  const target = normalizeRegisterTarget(request.target, request.context);
  if ("ok" in target) {
    return target;
  }

  const scopeFailure = ensureMcpToolRegistryScope<RegisterMcpToolOutput>(toolId, target.serverId, request.context);
  if (scopeFailure !== undefined) {
    return scopeFailure;
  }

  const permissionFailure = ensureMcpToolRegistryPermissions<RegisterMcpToolOutput>(
    toolId,
    mcpRegisterToolDescriptor.permissionsRequired,
    request.context,
    target.serverId,
  );
  if (permissionFailure !== undefined) {
    return permissionFailure;
  }

  const realExecutionFailure = blockMcpToolRegistryRealExecution<RegisterMcpToolOutput>(
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
      kind: "agentCore.basicTool.mcp.registerTool",
      target,
      dryRun: true,
      executionBlocked: true,
      permissionsRequired: mcpRegisterToolDescriptor.permissionsRequired,
      unsafeSideEffects: true,
    },
    audit: [
      createMcpToolRegistryAuditEvent(toolId, "agentCore.basicTool.mcp.registerTool.dryRun", request.context, target.serverId, {
        toolName: target.tool.name,
        replaceExisting: target.replaceExisting,
      }),
    ],
    events: ["basicTool.mcp.registerTool.dryRun"],
  };
}
