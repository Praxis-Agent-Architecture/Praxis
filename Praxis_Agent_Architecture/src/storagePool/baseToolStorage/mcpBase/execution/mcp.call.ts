/*
 * 文件定位：Agent 执行引擎 / 基础工具原语层 / 基础工具集合 / MCP 基础工具 / MCP 执行。
 * 核心目的：提供 MCP 基础工具 / MCP 执行 中的“调用 MCP 工具或服务”基础能力原语。
 * 能力要求1：需要定义该能力的输入、输出、错误、权限需求和可观测事件。
 * 能力要求2：这些基础工具是 Agent 成立的底层能力，不是 TAP 的最终高级工具库。
 * 能力要求3：后续 TAP 可以基于这些原语构建更强的工具编排、审批、替换和专业能力库。
 * 边界：保留 Agent 基础工具原语，不替代 TAP 的高级工具系统。
 * 对接：需要被 runtime.execEngine 拉起，并和 mainLoop、stateEngine、事件暴露、工具调用策略接通。
 * 实现提示：先补稳定类型契约、最小可测行为和清晰错误边界，再接入真实执行逻辑。
 */

export type McpCallPermission = "mcp:call" | "mcp:read" | "mcp:service";

export type McpCallErrorBoundary = "input" | "scope" | "permission" | "governance" | "contract";

export type McpCallMode = "tool" | "service";

export type McpCallContext = {
  runtimeId?: string;
  invocationId?: string;
  dryRun?: boolean;
  allowedServerIds?: readonly string[];
  grantedPermissions?: readonly McpCallPermission[];
  auditMetadata?: Readonly<Record<string, unknown>>;
};

export type McpCallTarget = {
  serverId: string;
  name: string;
  mode: McpCallMode;
  arguments?: Readonly<Record<string, unknown>>;
  timeoutMs?: number;
};

export type McpCallRequest = {
  target?: Partial<McpCallTarget>;
  context?: McpCallContext;
};

export type McpCallErrorCode =
  | "MISSING_SERVER_ID"
  | "MISSING_CALL_NAME"
  | "INVALID_CALL_MODE"
  | "INVALID_ARGUMENTS"
  | "INVALID_TIMEOUT"
  | "SCOPE_REJECTED"
  | "PERMISSION_DENIED"
  | "REAL_EXECUTION_BLOCKED";

export type McpCallError = {
  code: McpCallErrorCode;
  message: string;
  boundary: McpCallErrorBoundary;
  publicSafe: true;
};

export type McpCallAuditEvent = {
  type: string;
  toolId: "mcp.call";
  invocationId: string;
  dryRun: boolean;
  serverId?: string;
  metadata: Readonly<Record<string, unknown>>;
};

export type McpCallOutput = {
  kind: "agentCore.basicTool.mcp.call";
  target: McpCallTarget;
  dryRun: true;
  executionBlocked: true;
  permissionsRequired: readonly McpCallPermission[];
  unsafeSideEffects: true;
  requestEnvelope: {
    transport: "mcp";
    operation: "call";
    serverId: string;
    name: string;
    mode: McpCallMode;
    arguments: Readonly<Record<string, unknown>>;
    timeoutMs?: number;
  };
};

export type McpCallResult =
  | {
      ok: true;
      toolId: "mcp.call";
      output: McpCallOutput;
      audit: readonly McpCallAuditEvent[];
      events: readonly string[];
    }
  | {
      ok: false;
      toolId: "mcp.call";
      error: McpCallError;
      audit: readonly McpCallAuditEvent[];
      events: readonly string[];
    };

export const mcpCallDescriptor = {
  toolId: "mcp.call",
  capability: "call-mcp-tool-or-service",
  route: "agent_executionEngine.basic_toolLayer.baseTools.mcpBase.execution",
  defaultDryRun: true,
  tapOwnsApproval: true,
  permissionsRequired: ["mcp:call", "mcp:service"],
  unsafeSideEffects: true,
} as const;

function cleanList<T extends string>(values: readonly T[] | undefined): readonly T[] {
  return [...new Set((values ?? []).map((value) => value.trim()).filter(Boolean) as T[])];
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function dryRunEnabled(context: McpCallContext | undefined): boolean {
  return context?.dryRun !== false;
}

function invocationId(context: McpCallContext | undefined): string {
  return context?.invocationId?.trim() || "mcp.call:dry-run";
}

function auditEvent(
  type: string,
  context: McpCallContext | undefined,
  serverId?: string,
  metadata?: Readonly<Record<string, unknown>>,
): McpCallAuditEvent {
  return {
    type,
    toolId: mcpCallDescriptor.toolId,
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
  code: McpCallErrorCode,
  message: string,
  boundary: McpCallErrorBoundary,
  context: McpCallContext | undefined,
  serverId?: string,
): McpCallResult {
  return {
    ok: false,
    toolId: mcpCallDescriptor.toolId,
    error: { code, message, boundary, publicSafe: true },
    audit: [auditEvent("agentCore.basicTool.mcp.call.rejected", context, serverId, { code })],
    events: ["basicTool.mcp.call.rejected"],
  };
}

function normalizeMode(
  mode: string | undefined,
  context: McpCallContext | undefined,
  serverId: string,
): McpCallMode | McpCallResult {
  if (mode === undefined || mode.trim() === "" || mode === "tool") {
    return "tool";
  }

  if (mode === "service") {
    return "service";
  }

  return failure("INVALID_CALL_MODE", "mcp.call target.mode must be tool or service", "input", context, serverId);
}

function normalizeTarget(
  target: Partial<McpCallTarget> | undefined,
  context: McpCallContext | undefined,
): McpCallTarget | McpCallResult {
  const serverId = target?.serverId?.trim() ?? "";
  if (serverId.length === 0) {
    return failure("MISSING_SERVER_ID", "mcp.call requires target.serverId", "input", context);
  }

  const name = target?.name?.trim() ?? "";
  if (name.length === 0) {
    return failure("MISSING_CALL_NAME", "mcp.call requires target.name", "input", context, serverId);
  }

  const mode = normalizeMode(target?.mode, context, serverId);
  if (typeof mode !== "string") {
    return mode;
  }

  if (target?.arguments !== undefined && !isRecord(target.arguments)) {
    return failure("INVALID_ARGUMENTS", "mcp.call target.arguments must be a plain record", "input", context, serverId);
  }

  if (target?.timeoutMs !== undefined && (!Number.isFinite(target.timeoutMs) || target.timeoutMs <= 0)) {
    return failure("INVALID_TIMEOUT", "mcp.call target.timeoutMs must be a positive number", "input", context, serverId);
  }

  return {
    serverId,
    name,
    mode,
    arguments: target?.arguments ?? {},
    timeoutMs: target?.timeoutMs,
  };
}

function ensureServerScope(serverId: string, context: McpCallContext | undefined): McpCallResult | undefined {
  const allowedServerIds = cleanList(context?.allowedServerIds);
  if (allowedServerIds.length === 0 || allowedServerIds.includes(serverId)) {
    return undefined;
  }

  return failure("SCOPE_REJECTED", "mcp.call target server is outside the allowed MCP server scope", "scope", context, serverId);
}

function ensurePermissions(target: McpCallTarget, context: McpCallContext | undefined): McpCallResult | undefined {
  const grantedPermissions = cleanList(context?.grantedPermissions);
  if (grantedPermissions.length === 0) {
    return undefined;
  }

  const requiredPermissions: readonly McpCallPermission[] = target.mode === "tool" ? ["mcp:call"] : ["mcp:call", "mcp:service"];
  const missing = requiredPermissions.filter((permission) => !grantedPermissions.includes(permission));
  if (missing.length === 0) {
    return undefined;
  }

  return failure("PERMISSION_DENIED", `mcp.call is missing permissions: ${missing.join(", ")}`, "permission", context, target.serverId);
}

function ensureDryRunOnly(target: McpCallTarget, context: McpCallContext | undefined): McpCallResult | undefined {
  if (dryRunEnabled(context)) {
    return undefined;
  }

  return failure(
    "REAL_EXECUTION_BLOCKED",
    "mcp.call only returns a governed dry-run envelope in the first implementation",
    "contract",
    context,
    target.serverId,
  );
}

export function planMcpCall(request: McpCallRequest = {}): McpCallResult {
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

  const permissionsRequired: readonly McpCallPermission[] =
    target.mode === "tool" ? ["mcp:call"] : ["mcp:call", "mcp:service"];

  return {
    ok: true,
    toolId: mcpCallDescriptor.toolId,
    output: {
      kind: "agentCore.basicTool.mcp.call",
      target,
      dryRun: true,
      executionBlocked: true,
      permissionsRequired,
      unsafeSideEffects: true,
      requestEnvelope: {
        transport: "mcp",
        operation: "call",
        serverId: target.serverId,
        name: target.name,
        mode: target.mode,
        arguments: target.arguments ?? {},
        timeoutMs: target.timeoutMs,
      },
    },
    audit: [
      auditEvent("agentCore.basicTool.mcp.call.dryRun", request.context, target.serverId, {
        name: target.name,
        mode: target.mode,
      }),
    ],
    events: ["basicTool.mcp.call.dryRun"],
  };
}
