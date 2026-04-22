/*
 * 文件定位：Agent 执行引擎 / 基础工具原语层 / 基础工具集合 / MCP 基础工具 / MCP 订阅。
 * 核心目的：提供 MCP 基础工具 / MCP 订阅 中的“取消订阅”基础能力原语。
 * 能力要求1：需要定义该能力的输入、输出、错误、权限需求和可观测事件。
 * 能力要求2：这些基础工具是 Agent 成立的底层能力，不是 TAP 的最终高级工具库。
 * 能力要求3：后续 TAP 可以基于这些原语构建更强的工具编排、审批、替换和专业能力库。
 * 边界：保留 Agent 基础工具原语，不替代 TAP 的高级工具系统。
 * 对接：需要被 runtime.execEngine 拉起，并和 mainLoop、stateEngine、事件暴露、工具调用策略接通。
 * 实现提示：先补稳定类型契约、最小可测行为和清晰错误边界，再接入真实执行逻辑。
 */

export type McpUnsubscribePermission = "mcp:subscription:write";

export type McpUnsubscribeErrorBoundary = "input" | "scope" | "permission" | "contract" | "governance";

export type McpUnsubscribeGate = {
  accepted: boolean;
  reason?: string;
};

export type McpUnsubscribeContext = {
  runtimeId?: string;
  invocationId?: string;
  dryRun?: boolean;
  requestedScopes?: readonly string[];
  allowedScopes?: readonly string[];
  grantedPermissions?: readonly McpUnsubscribePermission[];
  contract?: McpUnsubscribeGate;
  governance?: McpUnsubscribeGate;
  auditMetadata?: Readonly<Record<string, unknown>>;
};

export type McpUnsubscribeTarget = {
  serverId: string;
  subscriptionId: string;
  reason?: string;
};

export type McpUnsubscribeRequest = {
  target?: Partial<McpUnsubscribeTarget>;
  context?: McpUnsubscribeContext;
};

export type McpUnsubscribeEnvelope = {
  subscriptionId: string;
  serverId: string;
  state: "cancel-planned";
  reason?: string;
  source: "mockable-envelope";
};

export type McpUnsubscribeErrorCode =
  | "MISSING_SERVER_ID"
  | "MISSING_SUBSCRIPTION_ID"
  | "SCOPE_DENIED"
  | "PERMISSION_DENIED"
  | "CONTRACT_REJECTED"
  | "GOVERNANCE_REJECTED"
  | "REAL_EXECUTION_BLOCKED";

export type McpUnsubscribeError = {
  code: McpUnsubscribeErrorCode;
  message: string;
  boundary: McpUnsubscribeErrorBoundary;
  publicSafe: true;
  internalDetailExposed: false;
};

export type McpUnsubscribeAuditEvent = {
  type: string;
  toolId: "mcp.unsubscribe";
  invocationId: string;
  dryRun: boolean;
  serverId?: string;
  subscriptionId?: string;
  metadata: Readonly<Record<string, unknown>>;
};

export type McpUnsubscribeOutput = {
  kind: "agentCore.basicTool.mcp.unsubscribe";
  target: McpUnsubscribeTarget;
  dryRun: true;
  executionBlocked: true;
  permissionsRequired: readonly McpUnsubscribePermission[];
  unsafeSideEffects: false;
  acceptedScopes: readonly string[];
  unsubscribeEnvelope: McpUnsubscribeEnvelope;
};

export type McpUnsubscribeResult =
  | {
      ok: true;
      toolId: "mcp.unsubscribe";
      output: McpUnsubscribeOutput;
      audit: readonly McpUnsubscribeAuditEvent[];
      events: readonly string[];
    }
  | {
      ok: false;
      toolId: "mcp.unsubscribe";
      error: McpUnsubscribeError;
      audit: readonly McpUnsubscribeAuditEvent[];
      events: readonly string[];
    };

export const mcpUnsubscribeDescriptor = {
  toolId: "mcp.unsubscribe",
  capability: "unsubscribe-mcp-events-or-resources",
  route: "agent_executionEngine.basic_toolLayer.baseTools.mcpBase.subscription",
  defaultDryRun: true,
  tapOwnsApproval: true,
  permissionsRequired: ["mcp:subscription:write"],
  unsafeSideEffects: false,
} as const;

function cleanList(values: readonly string[] | undefined): readonly string[] {
  return [...new Set((values ?? []).map((value) => value.trim()).filter(Boolean))];
}

function isBlank(value: string | undefined): boolean {
  return typeof value !== "string" || value.trim().length === 0;
}

function invocationId(context: McpUnsubscribeContext | undefined): string {
  return context?.invocationId?.trim() || "mcp.unsubscribe:dry-run";
}

function dryRunEnabled(context: McpUnsubscribeContext | undefined): boolean {
  return context?.dryRun !== false;
}

function auditEvent(
  type: string,
  context: McpUnsubscribeContext | undefined,
  target?: Partial<McpUnsubscribeTarget>,
  metadata?: Readonly<Record<string, unknown>>,
): McpUnsubscribeAuditEvent {
  return {
    type,
    toolId: mcpUnsubscribeDescriptor.toolId,
    invocationId: invocationId(context),
    dryRun: dryRunEnabled(context),
    serverId: target?.serverId?.trim() || undefined,
    subscriptionId: target?.subscriptionId?.trim() || undefined,
    metadata: {
      ...(context?.auditMetadata ?? {}),
      ...(metadata ?? {}),
    },
  };
}

function failure(
  code: McpUnsubscribeErrorCode,
  message: string,
  boundary: McpUnsubscribeErrorBoundary,
  context: McpUnsubscribeContext | undefined,
  target?: Partial<McpUnsubscribeTarget>,
): McpUnsubscribeResult {
  return {
    ok: false,
    toolId: mcpUnsubscribeDescriptor.toolId,
    error: { code, message, boundary, publicSafe: true, internalDetailExposed: false },
    audit: [auditEvent("agentCore.basicTool.mcp.unsubscribe.rejected", context, target, { code })],
    events: ["basicTool.mcp.unsubscribe.rejected"],
  };
}

function normalizeTarget(
  target: Partial<McpUnsubscribeTarget> | undefined,
  context: McpUnsubscribeContext | undefined,
): McpUnsubscribeTarget | McpUnsubscribeResult {
  const serverId = target?.serverId?.trim();
  const subscriptionId = target?.subscriptionId?.trim();

  if (!serverId) {
    return failure("MISSING_SERVER_ID", "mcp.unsubscribe requires target.serverId", "input", context, target);
  }

  if (!subscriptionId) {
    return failure("MISSING_SUBSCRIPTION_ID", "mcp.unsubscribe requires target.subscriptionId", "input", context, target);
  }

  return {
    serverId,
    subscriptionId,
    reason: target?.reason?.trim() || undefined,
  };
}

function resolveScopes(
  context: McpUnsubscribeContext | undefined,
  target: McpUnsubscribeTarget,
): readonly string[] | McpUnsubscribeResult {
  const requested = cleanList(context?.requestedScopes);
  const allowed = cleanList(context?.allowedScopes);

  if (requested.length === 0 || allowed.length === 0) {
    return requested;
  }

  const denied = requested.filter((scope) => !allowed.includes(scope));
  if (denied.length > 0) {
    return failure("SCOPE_DENIED", `mcp.unsubscribe scope ${denied[0]} is outside runtime governance`, "scope", context, target);
  }

  return requested;
}

function ensurePermissions(
  context: McpUnsubscribeContext | undefined,
  target: McpUnsubscribeTarget,
): McpUnsubscribeResult | undefined {
  const granted = cleanList(context?.grantedPermissions);
  if (granted.length === 0) {
    return undefined;
  }

  const missing = mcpUnsubscribeDescriptor.permissionsRequired.filter((permission) => !granted.includes(permission));
  if (missing.length === 0) {
    return undefined;
  }

  return failure("PERMISSION_DENIED", `mcp.unsubscribe is missing permissions: ${missing.join(", ")}`, "permission", context, target);
}

export function planMcpUnsubscribe(request: McpUnsubscribeRequest = {}): McpUnsubscribeResult {
  const target = normalizeTarget(request.target, request.context);
  if ("ok" in target) {
    return target;
  }

  if (request.context?.contract?.accepted === false) {
    return failure(
      "CONTRACT_REJECTED",
      request.context.contract.reason ?? "mcp.unsubscribe was rejected by runtime contract surface",
      "contract",
      request.context,
      target,
    );
  }

  if (request.context?.governance?.accepted === false) {
    return failure(
      "GOVERNANCE_REJECTED",
      request.context.governance.reason ?? "mcp.unsubscribe was rejected by runtime governance",
      "governance",
      request.context,
      target,
    );
  }

  const scopes = resolveScopes(request.context, target);
  if ("ok" in scopes) {
    return scopes;
  }

  const permissionFailure = ensurePermissions(request.context, target);
  if (permissionFailure !== undefined) {
    return permissionFailure;
  }

  if (!dryRunEnabled(request.context)) {
    return failure(
      "REAL_EXECUTION_BLOCKED",
      "mcp.unsubscribe only returns a guarded dry-run unsubscribe plan in the first implementation",
      "contract",
      request.context,
      target,
    );
  }

  return {
    ok: true,
    toolId: mcpUnsubscribeDescriptor.toolId,
    output: {
      kind: "agentCore.basicTool.mcp.unsubscribe",
      target,
      dryRun: true,
      executionBlocked: true,
      permissionsRequired: mcpUnsubscribeDescriptor.permissionsRequired,
      unsafeSideEffects: false,
      acceptedScopes: scopes,
      unsubscribeEnvelope: {
        subscriptionId: target.subscriptionId,
        serverId: target.serverId,
        state: "cancel-planned",
        reason: target.reason,
        source: "mockable-envelope",
      },
    },
    audit: [
      auditEvent("agentCore.basicTool.mcp.unsubscribe.dryRun", request.context, target, {
        reasonProvided: target.reason !== undefined,
      }),
    ],
    events: ["basicTool.mcp.unsubscribe.dryRun"],
  };
}
