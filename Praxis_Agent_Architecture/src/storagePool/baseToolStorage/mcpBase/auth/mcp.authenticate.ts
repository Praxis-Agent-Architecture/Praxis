/*
 * 文件定位：Agent 执行引擎 / 基础工具原语层 / 基础工具集合 / MCP 基础工具 / MCP 鉴权。
 * 核心目的：提供 MCP 基础工具 / MCP 鉴权 中的“完成认证”基础能力原语。
 * 能力要求1：需要定义该能力的输入、输出、错误、权限需求和可观测事件。
 * 能力要求2：这些基础工具是 Agent 成立的底层能力，不是 TAP 的最终高级工具库。
 * 能力要求3：后续 TAP 可以基于这些原语构建更强的工具编排、审批、替换和专业能力库。
 * 边界：保留 Agent 基础工具原语，不替代 TAP 的高级工具系统。
 * 对接：需要被 runtime.execEngine 拉起，并和 mainLoop、stateEngine、事件暴露、工具调用策略接通。
 * 实现提示：先补稳定类型契约、最小可测行为和清晰错误边界，再接入真实执行逻辑。
 */

export type McpToolBoundary = "input" | "contract" | "permission" | "scope" | "governance" | "execution" | "environment";

export type McpToolPermission = "mcp:connect" | "mcp:auth" | "mcp:read" | "mcp:write" | "cache:read" | "cache:write";

export type McpToolContext = {
  runtimeId?: string;
  invocationId?: string;
  dryRun?: boolean;
  allowedServerIds?: readonly string[];
  grantedPermissions?: readonly McpToolPermission[];
  auditMetadata?: Readonly<Record<string, unknown>>;
};

export type McpToolAuditEvent = {
  type: string;
  toolId: string;
  invocationId: string;
  dryRun: boolean;
  serverId?: string;
  metadata: Readonly<Record<string, unknown>>;
};

export type McpToolErrorCode =
  | "MISSING_SERVER_ID"
  | "MISSING_CREDENTIAL_REF"
  | "MISSING_SUBJECT_ID"
  | "MISSING_AUTH_ACTION"
  | "MISSING_CACHE_KEY"
  | "MISSING_CACHE_VALUE_REF"
  | "INVALID_AUTH_STRATEGY"
  | "INVALID_CACHE_TTL"
  | "SCOPE_REJECTED"
  | "PERMISSION_DENIED"
  | "REAL_EXECUTION_BLOCKED";

export type McpToolError = {
  code: McpToolErrorCode;
  message: string;
  boundary: McpToolBoundary;
  publicSafe: true;
};

export type McpToolResult<Output> =
  | {
      ok: true;
      toolId: string;
      output: Output;
      audit: readonly McpToolAuditEvent[];
      events: readonly string[];
    }
  | {
      ok: false;
      toolId: string;
      error: McpToolError;
      audit: readonly McpToolAuditEvent[];
      events: readonly string[];
    };

export type McpAuthStrategy = "oauth" | "api-key" | "bearer-token" | "custom";

export type McpAuthenticateTarget = {
  serverId: string;
  authStrategy: McpAuthStrategy;
  credentialRef: string;
  requestedScopes?: readonly string[];
};

export type McpAuthenticateRequest = {
  target?: Partial<McpAuthenticateTarget>;
  context?: McpToolContext;
};

export type McpAuthenticateOutput = {
  kind: "agentCore.basicTool.mcp.authenticate";
  target: McpAuthenticateTarget;
  dryRun: true;
  executionBlocked: true;
  permissionsRequired: readonly McpToolPermission[];
  credentialMaterialAccepted: false;
  tokenIssued: false;
  authEnvelope: {
    serverId: string;
    authStrategy: McpAuthStrategy;
    credentialRef: string;
    requestedScopes: readonly string[];
  };
};

export const mcpAuthenticateDescriptor = {
  toolId: "mcp.authenticate",
  capability: "authenticate-mcp-server",
  route: "agent_executionEngine.basic_toolLayer.baseTools.mcpBase.auth",
  permissionsRequired: ["mcp:connect", "mcp:auth"],
  defaultDryRun: true,
  acceptsRawSecrets: false,
  tapOwnsApproval: true,
} as const;

export function cleanMcpList<T extends string>(values: readonly T[] | undefined): readonly T[] {
  return [...new Set((values ?? []).map((value) => value.trim()).filter(Boolean) as T[])];
}

export function isBlankMcpValue(value: string | undefined): boolean {
  return typeof value !== "string" || value.trim().length === 0;
}

export function mcpDryRunEnabled(context: McpToolContext | undefined): boolean {
  return context?.dryRun !== false;
}

export function mcpInvocationId(toolId: string, context: McpToolContext | undefined): string {
  return context?.invocationId?.trim() || `${toolId}:dry-run`;
}

export function createMcpAuditEvent(
  toolId: string,
  type: string,
  context: McpToolContext | undefined,
  serverId?: string,
  metadata?: Readonly<Record<string, unknown>>,
): McpToolAuditEvent {
  return {
    type,
    toolId,
    invocationId: mcpInvocationId(toolId, context),
    dryRun: mcpDryRunEnabled(context),
    serverId,
    metadata: {
      ...(context?.auditMetadata ?? {}),
      ...(metadata ?? {}),
    },
  };
}

export function createMcpToolFailure<Output>(
  toolId: string,
  code: McpToolErrorCode,
  message: string,
  boundary: McpToolBoundary,
  context: McpToolContext | undefined,
  serverId?: string,
): McpToolResult<Output> {
  return {
    ok: false,
    toolId,
    error: { code, message, boundary, publicSafe: true },
    audit: [createMcpAuditEvent(toolId, "agentCore.basicTool.mcp.rejected", context, serverId, { code })],
    events: ["basicTool.mcp.rejected"],
  };
}

export function normalizeMcpServerId(
  toolId: string,
  serverId: string | undefined,
  context: McpToolContext | undefined,
): string | McpToolResult<never> {
  const normalized = serverId?.trim() ?? "";
  if (isBlankMcpValue(normalized)) {
    return createMcpToolFailure(toolId, "MISSING_SERVER_ID", `${toolId} requires target.serverId`, "input", context, serverId);
  }

  return normalized;
}

export function ensureMcpServerScope<Output>(
  toolId: string,
  serverId: string,
  context: McpToolContext | undefined,
): McpToolResult<Output> | undefined {
  const allowedServerIds = cleanMcpList(context?.allowedServerIds);
  if (allowedServerIds.length === 0) {
    return undefined;
  }

  if (allowedServerIds.includes(serverId)) {
    return undefined;
  }

  return createMcpToolFailure(
    toolId,
    "SCOPE_REJECTED",
    `${toolId} target server is outside the allowed MCP server ids`,
    "scope",
    context,
    serverId,
  );
}

export function ensureMcpToolPermissions<Output>(
  toolId: string,
  permissionsRequired: readonly McpToolPermission[],
  context: McpToolContext | undefined,
  serverId: string,
): McpToolResult<Output> | undefined {
  const granted = cleanMcpList(context?.grantedPermissions);
  if (granted.length === 0) {
    return undefined;
  }

  const missing = permissionsRequired.filter((permission) => !granted.includes(permission));
  if (missing.length === 0) {
    return undefined;
  }

  return createMcpToolFailure(
    toolId,
    "PERMISSION_DENIED",
    `${toolId} is missing permissions: ${missing.join(", ")}`,
    "permission",
    context,
    serverId,
  );
}

export function blockRealMcpExecution<Output>(
  toolId: string,
  context: McpToolContext | undefined,
  serverId: string,
): McpToolResult<Output> | undefined {
  if (mcpDryRunEnabled(context)) {
    return undefined;
  }

  return createMcpToolFailure(
    toolId,
    "REAL_EXECUTION_BLOCKED",
    `${toolId} only returns a guarded dry-run plan in the first implementation`,
    "contract",
    context,
    serverId,
  );
}

function normalizeAuthStrategy(strategy: string | undefined): McpAuthStrategy | undefined {
  if (strategy === "oauth" || strategy === "api-key" || strategy === "bearer-token" || strategy === "custom") {
    return strategy;
  }

  return undefined;
}

function normalizeAuthenticateTarget(
  target: Partial<McpAuthenticateTarget> | undefined,
  context: McpToolContext | undefined,
): McpAuthenticateTarget | McpToolResult<McpAuthenticateOutput> {
  const toolId = mcpAuthenticateDescriptor.toolId;
  const serverId = normalizeMcpServerId(toolId, target?.serverId, context);
  if (typeof serverId !== "string") {
    return serverId;
  }

  const authStrategy = normalizeAuthStrategy(target?.authStrategy);
  if (authStrategy === undefined) {
    return createMcpToolFailure(
      toolId,
      "INVALID_AUTH_STRATEGY",
      `${toolId} requires target.authStrategy to be oauth, api-key, bearer-token, or custom`,
      "input",
      context,
      serverId,
    );
  }

  const credentialRef = target?.credentialRef?.trim() ?? "";
  if (credentialRef.length === 0) {
    return createMcpToolFailure(
      toolId,
      "MISSING_CREDENTIAL_REF",
      `${toolId} requires target.credentialRef instead of raw credential material`,
      "input",
      context,
      serverId,
    );
  }

  return {
    serverId,
    authStrategy,
    credentialRef,
    requestedScopes: cleanMcpList(target?.requestedScopes),
  };
}

export function planMcpAuthenticate(request: McpAuthenticateRequest = {}): McpToolResult<McpAuthenticateOutput> {
  const toolId = mcpAuthenticateDescriptor.toolId;
  const target = normalizeAuthenticateTarget(request.target, request.context);
  if ("ok" in target) {
    return target;
  }

  const scopeFailure = ensureMcpServerScope<McpAuthenticateOutput>(toolId, target.serverId, request.context);
  if (scopeFailure !== undefined) {
    return scopeFailure;
  }

  const permissionFailure = ensureMcpToolPermissions<McpAuthenticateOutput>(
    toolId,
    mcpAuthenticateDescriptor.permissionsRequired,
    request.context,
    target.serverId,
  );
  if (permissionFailure !== undefined) {
    return permissionFailure;
  }

  const realExecutionFailure = blockRealMcpExecution<McpAuthenticateOutput>(toolId, request.context, target.serverId);
  if (realExecutionFailure !== undefined) {
    return realExecutionFailure;
  }

  return {
    ok: true,
    toolId,
    output: {
      kind: "agentCore.basicTool.mcp.authenticate",
      target,
      dryRun: true,
      executionBlocked: true,
      permissionsRequired: mcpAuthenticateDescriptor.permissionsRequired,
      credentialMaterialAccepted: false,
      tokenIssued: false,
      authEnvelope: {
        serverId: target.serverId,
        authStrategy: target.authStrategy,
        credentialRef: target.credentialRef,
        requestedScopes: target.requestedScopes ?? [],
      },
    },
    audit: [
      createMcpAuditEvent(toolId, "agentCore.basicTool.mcp.authenticate.dryRun", request.context, target.serverId, {
        authStrategy: target.authStrategy,
        requestedScopeCount: target.requestedScopes?.length ?? 0,
        acceptsRawSecrets: false,
      }),
    ],
    events: ["basicTool.mcp.authenticate.dryRun"],
  };
}
