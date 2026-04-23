/*
 * 文件定位：Agent 执行引擎 / 基础工具原语层 / 基础工具集合 / MCP 基础工具 / MCP 执行。
 * 核心目的：提供 MCP 基础工具 / MCP 执行 中的“执行原生 MCP 调用”基础能力原语。
 * 能力要求1：需要定义该能力的输入、输出、错误、权限需求和可观测事件。
 * 能力要求2：这些基础工具是 Agent 成立的底层能力，不是 TAP 的最终高级工具库。
 * 能力要求3：后续 TAP 可以基于这些原语构建更强的工具编排、审批、替换和专业能力库。
 * 边界：保留 Agent 基础工具原语，不替代 TAP 的高级工具系统。
 * 对接：需要被 runtime.execEngine 拉起，并和 mainLoop、stateEngine、事件暴露、工具调用策略接通。
 * 实现提示：先补稳定类型契约、最小可测行为和清晰错误边界，再接入真实执行逻辑。
 */

export type McpNativeExecutePermission = "mcp:native-execute" | "mcp:raw";

export type McpNativeExecuteErrorBoundary = "input" | "scope" | "permission" | "governance" | "contract";

export type McpNativeExecuteContext = {
  runtimeId?: string;
  invocationId?: string;
  dryRun?: boolean;
  allowedServerIds?: readonly string[];
  grantedPermissions?: readonly McpNativeExecutePermission[];
  auditMetadata?: Readonly<Record<string, unknown>>;
};

export type McpNativeExecuteTarget = {
  serverId: string;
  method: string;
  params?: Readonly<Record<string, unknown>>;
  protocolVersion?: string;
  idempotencyKey?: string;
};

export type McpNativeExecuteRequest = {
  target?: Partial<McpNativeExecuteTarget>;
  context?: McpNativeExecuteContext;
};

export type McpNativeExecuteErrorCode =
  | "MISSING_SERVER_ID"
  | "MISSING_METHOD"
  | "INVALID_PARAMS"
  | "INVALID_PROTOCOL_VERSION"
  | "SCOPE_REJECTED"
  | "PERMISSION_DENIED"
  | "REAL_EXECUTION_BLOCKED";

export type McpNativeExecuteError = {
  code: McpNativeExecuteErrorCode;
  message: string;
  boundary: McpNativeExecuteErrorBoundary;
  publicSafe: true;
};

export type McpNativeExecuteAuditEvent = {
  type: string;
  toolId: "mcp.nativeExecute";
  invocationId: string;
  dryRun: boolean;
  serverId?: string;
  metadata: Readonly<Record<string, unknown>>;
};

export type McpNativeExecuteOutput = {
  kind: "agentCore.basicTool.mcp.nativeExecute";
  target: McpNativeExecuteTarget;
  dryRun: true;
  executionBlocked: true;
  permissionsRequired: readonly McpNativeExecutePermission[];
  unsafeSideEffects: true;
  nativeEnvelope: {
    transport: "mcp";
    operation: "nativeExecute";
    serverId: string;
    method: string;
    params: Readonly<Record<string, unknown>>;
    protocolVersion?: string;
    idempotencyKey?: string;
  };
};

export type McpNativeExecuteResult =
  | {
      ok: true;
      toolId: "mcp.nativeExecute";
      output: McpNativeExecuteOutput;
      audit: readonly McpNativeExecuteAuditEvent[];
      events: readonly string[];
    }
  | {
      ok: false;
      toolId: "mcp.nativeExecute";
      error: McpNativeExecuteError;
      audit: readonly McpNativeExecuteAuditEvent[];
      events: readonly string[];
    };

export const mcpNativeExecuteDescriptor = {
  toolId: "mcp.nativeExecute",
  capability: "execute-native-mcp-call",
  route: "agent_executionEngine.basic_toolLayer.baseTools.mcpBase.execution",
  defaultDryRun: true,
  tapOwnsApproval: true,
  permissionsRequired: ["mcp:native-execute", "mcp:raw"],
  unsafeSideEffects: true,
} as const;

function cleanList<T extends string>(values: readonly T[] | undefined): readonly T[] {
  return [...new Set((values ?? []).map((value) => value.trim()).filter(Boolean) as T[])];
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function dryRunEnabled(context: McpNativeExecuteContext | undefined): boolean {
  return context?.dryRun !== false;
}

function invocationId(context: McpNativeExecuteContext | undefined): string {
  return context?.invocationId?.trim() || "mcp.nativeExecute:dry-run";
}

function auditEvent(
  type: string,
  context: McpNativeExecuteContext | undefined,
  serverId?: string,
  metadata?: Readonly<Record<string, unknown>>,
): McpNativeExecuteAuditEvent {
  return {
    type,
    toolId: mcpNativeExecuteDescriptor.toolId,
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
  code: McpNativeExecuteErrorCode,
  message: string,
  boundary: McpNativeExecuteErrorBoundary,
  context: McpNativeExecuteContext | undefined,
  serverId?: string,
): McpNativeExecuteResult {
  return {
    ok: false,
    toolId: mcpNativeExecuteDescriptor.toolId,
    error: { code, message, boundary, publicSafe: true },
    audit: [auditEvent("agentCore.basicTool.mcp.nativeExecute.rejected", context, serverId, { code })],
    events: ["basicTool.mcp.nativeExecute.rejected"],
  };
}

function normalizeTarget(
  target: Partial<McpNativeExecuteTarget> | undefined,
  context: McpNativeExecuteContext | undefined,
): McpNativeExecuteTarget | McpNativeExecuteResult {
  const serverId = target?.serverId?.trim() ?? "";
  if (serverId.length === 0) {
    return failure("MISSING_SERVER_ID", "mcp.nativeExecute requires target.serverId", "input", context);
  }

  const method = target?.method?.trim() ?? "";
  if (method.length === 0) {
    return failure("MISSING_METHOD", "mcp.nativeExecute requires target.method", "input", context, serverId);
  }

  if (target?.params !== undefined && !isRecord(target.params)) {
    return failure("INVALID_PARAMS", "mcp.nativeExecute target.params must be a plain record", "input", context, serverId);
  }

  const protocolVersion = target?.protocolVersion?.trim();
  if (target?.protocolVersion !== undefined && protocolVersion?.length === 0) {
    return failure(
      "INVALID_PROTOCOL_VERSION",
      "mcp.nativeExecute target.protocolVersion must not be blank when provided",
      "input",
      context,
      serverId,
    );
  }

  return {
    serverId,
    method,
    params: target?.params ?? {},
    protocolVersion,
    idempotencyKey: target?.idempotencyKey?.trim() || undefined,
  };
}

function ensureServerScope(serverId: string, context: McpNativeExecuteContext | undefined): McpNativeExecuteResult | undefined {
  const allowedServerIds = cleanList(context?.allowedServerIds);
  if (allowedServerIds.length === 0 || allowedServerIds.includes(serverId)) {
    return undefined;
  }

  return failure(
    "SCOPE_REJECTED",
    "mcp.nativeExecute target server is outside the allowed MCP server scope",
    "scope",
    context,
    serverId,
  );
}

function ensurePermissions(
  target: McpNativeExecuteTarget,
  context: McpNativeExecuteContext | undefined,
): McpNativeExecuteResult | undefined {
  const grantedPermissions = cleanList(context?.grantedPermissions);
  if (grantedPermissions.length === 0) {
    return undefined;
  }

  const missing = mcpNativeExecuteDescriptor.permissionsRequired.filter((permission) => !grantedPermissions.includes(permission));
  if (missing.length === 0) {
    return undefined;
  }

  return failure(
    "PERMISSION_DENIED",
    `mcp.nativeExecute is missing permissions: ${missing.join(", ")}`,
    "permission",
    context,
    target.serverId,
  );
}

function ensureDryRunOnly(
  target: McpNativeExecuteTarget,
  context: McpNativeExecuteContext | undefined,
): McpNativeExecuteResult | undefined {
  if (dryRunEnabled(context)) {
    return undefined;
  }

  return failure(
    "REAL_EXECUTION_BLOCKED",
    "mcp.nativeExecute only returns a governed dry-run envelope in the first implementation",
    "contract",
    context,
    target.serverId,
  );
}

export function planMcpNativeExecute(request: McpNativeExecuteRequest = {}): McpNativeExecuteResult {
  const target = normalizeTarget(request.target, request.context);
  if ("ok" in target) {
    return target;
  }

  const scopeFailure = ensureServerScope(target.serverId, request.context);
  if (scopeFailure !== undefined) {
    return scopeFailure;
  }

  const permissionFailure = ensurePermissions(target, request.context);
  if (permissionFailure !== undefined) {
    return permissionFailure;
  }

  const realExecutionFailure = ensureDryRunOnly(target, request.context);
  if (realExecutionFailure !== undefined) {
    return realExecutionFailure;
  }

  return {
    ok: true,
    toolId: mcpNativeExecuteDescriptor.toolId,
    output: {
      kind: "agentCore.basicTool.mcp.nativeExecute",
      target,
      dryRun: true,
      executionBlocked: true,
      permissionsRequired: mcpNativeExecuteDescriptor.permissionsRequired,
      unsafeSideEffects: true,
      nativeEnvelope: {
        transport: "mcp",
        operation: "nativeExecute",
        serverId: target.serverId,
        method: target.method,
        params: target.params ?? {},
        protocolVersion: target.protocolVersion,
        idempotencyKey: target.idempotencyKey,
      },
    },
    audit: [
      auditEvent("agentCore.basicTool.mcp.nativeExecute.dryRun", request.context, target.serverId, {
        method: target.method,
        protocolVersion: target.protocolVersion,
      }),
    ],
    events: ["basicTool.mcp.nativeExecute.dryRun"],
  };
}
