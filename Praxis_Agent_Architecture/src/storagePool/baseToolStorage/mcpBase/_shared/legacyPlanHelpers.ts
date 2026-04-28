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
  if (allowedServerIds.length === 0 || allowedServerIds.includes(serverId)) return undefined;
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
  if (granted.length === 0) return undefined;
  const missing = permissionsRequired.filter((permission) => !granted.includes(permission));
  if (missing.length === 0) return undefined;
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
  if (mcpDryRunEnabled(context)) return undefined;
  return createMcpToolFailure(
    toolId,
    "REAL_EXECUTION_BLOCKED",
    `${toolId} only returns a guarded dry-run plan in the first implementation`,
    "contract",
    context,
    serverId,
  );
}
