/*
 * 文件定位：Agent 执行引擎 / 基础工具原语层 / 基础工具集合 / MCP 基础工具 / MCP 订阅。
 * 核心目的：提供 MCP 基础工具 / MCP 订阅 中的“订阅事件或资源”基础能力原语。
 * 能力要求1：需要定义该能力的输入、输出、错误、权限需求和可观测事件。
 * 能力要求2：这些基础工具是 Agent 成立的底层能力，不是 TAP 的最终高级工具库。
 * 能力要求3：后续 TAP 可以基于这些原语构建更强的工具编排、审批、替换和专业能力库。
 * 边界：保留 Agent 基础工具原语，不替代 TAP 的高级工具系统。
 * 对接：需要被 runtime.execEngine 拉起，并和 mainLoop、stateEngine、事件暴露、工具调用策略接通。
 * 实现提示：先补稳定类型契约、最小可测行为和清晰错误边界，再接入真实执行逻辑。
 */

export type McpSubscribePermission = "mcp:subscription:write";

export type McpSubscribeErrorBoundary = "input" | "scope" | "permission" | "contract" | "governance";

export type McpSubscribeGate = {
  accepted: boolean;
  reason?: string;
};

export type McpSubscribeSubjectType = "resource" | "event" | "tool";

export type McpSubscribeReplayPolicy = "none" | "latest";

export type McpSubscribeContext = {
  runtimeId?: string;
  invocationId?: string;
  dryRun?: boolean;
  requestedScopes?: readonly string[];
  allowedScopes?: readonly string[];
  grantedPermissions?: readonly McpSubscribePermission[];
  contract?: McpSubscribeGate;
  governance?: McpSubscribeGate;
  auditMetadata?: Readonly<Record<string, unknown>>;
};

export type McpSubscribeTarget = {
  serverId: string;
  subjectType: McpSubscribeSubjectType;
  subject: string;
  eventKinds?: readonly string[];
  replayPolicy?: McpSubscribeReplayPolicy;
};

export type McpSubscribeRequest = {
  target?: Partial<McpSubscribeTarget>;
  context?: McpSubscribeContext;
};

export type McpSubscriptionEnvelope = {
  subscriptionId: string;
  serverId: string;
  subjectType: McpSubscribeSubjectType;
  subject: string;
  eventKinds: readonly string[];
  replayPolicy: McpSubscribeReplayPolicy;
  state: "planned";
  source: "mockable-envelope";
};

export type McpSubscribeErrorCode =
  | "MISSING_SERVER_ID"
  | "MISSING_SUBJECT_TYPE"
  | "INVALID_SUBJECT_TYPE"
  | "MISSING_SUBJECT"
  | "INVALID_REPLAY_POLICY"
  | "SCOPE_DENIED"
  | "PERMISSION_DENIED"
  | "CONTRACT_REJECTED"
  | "GOVERNANCE_REJECTED"
  | "REAL_EXECUTION_BLOCKED";

export type McpSubscribeError = {
  code: McpSubscribeErrorCode;
  message: string;
  boundary: McpSubscribeErrorBoundary;
  publicSafe: true;
  internalDetailExposed: false;
};

export type McpSubscribeAuditEvent = {
  type: string;
  toolId: "mcp.subscribe";
  invocationId: string;
  dryRun: boolean;
  serverId?: string;
  subject?: string;
  metadata: Readonly<Record<string, unknown>>;
};

export type McpSubscribeOutput = {
  kind: "agentCore.basicTool.mcp.subscribe";
  target: McpSubscribeTarget;
  dryRun: true;
  executionBlocked: true;
  permissionsRequired: readonly McpSubscribePermission[];
  unsafeSideEffects: false;
  acceptedScopes: readonly string[];
  subscriptionEnvelope: McpSubscriptionEnvelope;
};

export type McpSubscribeResult =
  | {
      ok: true;
      toolId: "mcp.subscribe";
      output: McpSubscribeOutput;
      audit: readonly McpSubscribeAuditEvent[];
      events: readonly string[];
    }
  | {
      ok: false;
      toolId: "mcp.subscribe";
      error: McpSubscribeError;
      audit: readonly McpSubscribeAuditEvent[];
      events: readonly string[];
    };

export const mcpSubscribeDescriptor = {
  toolId: "mcp.subscribe",
  capability: "subscribe-mcp-events-or-resources",
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

function invocationId(context: McpSubscribeContext | undefined): string {
  return context?.invocationId?.trim() || "mcp.subscribe:dry-run";
}

function dryRunEnabled(context: McpSubscribeContext | undefined): boolean {
  return context?.dryRun !== false;
}

function auditEvent(
  type: string,
  context: McpSubscribeContext | undefined,
  target?: Partial<McpSubscribeTarget>,
  metadata?: Readonly<Record<string, unknown>>,
): McpSubscribeAuditEvent {
  return {
    type,
    toolId: mcpSubscribeDescriptor.toolId,
    invocationId: invocationId(context),
    dryRun: dryRunEnabled(context),
    serverId: target?.serverId?.trim() || undefined,
    subject: target?.subject?.trim() || undefined,
    metadata: {
      ...(context?.auditMetadata ?? {}),
      ...(metadata ?? {}),
    },
  };
}

function failure(
  code: McpSubscribeErrorCode,
  message: string,
  boundary: McpSubscribeErrorBoundary,
  context: McpSubscribeContext | undefined,
  target?: Partial<McpSubscribeTarget>,
): McpSubscribeResult {
  return {
    ok: false,
    toolId: mcpSubscribeDescriptor.toolId,
    error: { code, message, boundary, publicSafe: true, internalDetailExposed: false },
    audit: [auditEvent("agentCore.basicTool.mcp.subscribe.rejected", context, target, { code })],
    events: ["basicTool.mcp.subscribe.rejected"],
  };
}

function normalizeSubjectType(
  subjectType: string | undefined,
  context: McpSubscribeContext | undefined,
  target?: Partial<McpSubscribeTarget>,
): McpSubscribeSubjectType | McpSubscribeResult {
  if (isBlank(subjectType)) {
    return failure("MISSING_SUBJECT_TYPE", "mcp.subscribe requires target.subjectType", "input", context, target);
  }

  if (subjectType === "resource" || subjectType === "event" || subjectType === "tool") {
    return subjectType;
  }

  return failure("INVALID_SUBJECT_TYPE", "mcp.subscribe target.subjectType must be resource, event, or tool", "input", context, target);
}

function normalizeReplayPolicy(
  replayPolicy: string | undefined,
  context: McpSubscribeContext | undefined,
  target?: Partial<McpSubscribeTarget>,
): McpSubscribeReplayPolicy | McpSubscribeResult {
  if (replayPolicy === undefined || replayPolicy.trim() === "") {
    return "none";
  }

  if (replayPolicy === "none" || replayPolicy === "latest") {
    return replayPolicy;
  }

  return failure("INVALID_REPLAY_POLICY", "mcp.subscribe target.replayPolicy must be none or latest", "input", context, target);
}

function normalizeTarget(
  target: Partial<McpSubscribeTarget> | undefined,
  context: McpSubscribeContext | undefined,
): McpSubscribeTarget | McpSubscribeResult {
  const serverId = target?.serverId?.trim();
  const subject = target?.subject?.trim();

  if (!serverId) {
    return failure("MISSING_SERVER_ID", "mcp.subscribe requires target.serverId", "input", context, target);
  }

  const subjectType = normalizeSubjectType(target?.subjectType, context, target);
  if (typeof subjectType !== "string") {
    return subjectType;
  }

  if (!subject) {
    return failure("MISSING_SUBJECT", "mcp.subscribe requires target.subject", "input", context, target);
  }

  const replayPolicy = normalizeReplayPolicy(target?.replayPolicy, context, target);
  if (typeof replayPolicy !== "string") {
    return replayPolicy;
  }

  return {
    serverId,
    subjectType,
    subject,
    eventKinds: cleanList(target?.eventKinds),
    replayPolicy,
  };
}

function resolveScopes(
  context: McpSubscribeContext | undefined,
  target: McpSubscribeTarget,
): readonly string[] | McpSubscribeResult {
  const requested = cleanList(context?.requestedScopes);
  const allowed = cleanList(context?.allowedScopes);

  if (requested.length === 0 || allowed.length === 0) {
    return requested;
  }

  const denied = requested.filter((scope) => !allowed.includes(scope));
  if (denied.length > 0) {
    return failure("SCOPE_DENIED", `mcp.subscribe scope ${denied[0]} is outside runtime governance`, "scope", context, target);
  }

  return requested;
}

function ensurePermissions(
  context: McpSubscribeContext | undefined,
  target: McpSubscribeTarget,
): McpSubscribeResult | undefined {
  const granted = cleanList(context?.grantedPermissions);
  if (granted.length === 0) {
    return undefined;
  }

  const missing = mcpSubscribeDescriptor.permissionsRequired.filter((permission) => !granted.includes(permission));
  if (missing.length === 0) {
    return undefined;
  }

  return failure("PERMISSION_DENIED", `mcp.subscribe is missing permissions: ${missing.join(", ")}`, "permission", context, target);
}

function subscriptionId(target: McpSubscribeTarget, context: McpSubscribeContext | undefined): string {
  return `${invocationId(context)}:${target.serverId}:${target.subjectType}:${target.subject}`;
}

export function planMcpSubscribe(request: McpSubscribeRequest = {}): McpSubscribeResult {
  const target = normalizeTarget(request.target, request.context);
  if ("ok" in target) {
    return target;
  }

  if (request.context?.contract?.accepted === false) {
    return failure(
      "CONTRACT_REJECTED",
      request.context.contract.reason ?? "mcp.subscribe was rejected by runtime contract surface",
      "contract",
      request.context,
      target,
    );
  }

  if (request.context?.governance?.accepted === false) {
    return failure(
      "GOVERNANCE_REJECTED",
      request.context.governance.reason ?? "mcp.subscribe was rejected by runtime governance",
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
      "mcp.subscribe only returns a guarded dry-run subscription plan in the first implementation",
      "contract",
      request.context,
      target,
    );
  }

  return {
    ok: true,
    toolId: mcpSubscribeDescriptor.toolId,
    output: {
      kind: "agentCore.basicTool.mcp.subscribe",
      target,
      dryRun: true,
      executionBlocked: true,
      permissionsRequired: mcpSubscribeDescriptor.permissionsRequired,
      unsafeSideEffects: false,
      acceptedScopes: scopes,
      subscriptionEnvelope: {
        subscriptionId: subscriptionId(target, request.context),
        serverId: target.serverId,
        subjectType: target.subjectType,
        subject: target.subject,
        eventKinds: target.eventKinds ?? [],
        replayPolicy: target.replayPolicy ?? "none",
        state: "planned",
        source: "mockable-envelope",
      },
    },
    audit: [
      auditEvent("agentCore.basicTool.mcp.subscribe.dryRun", request.context, target, {
        subjectType: target.subjectType,
        eventKinds: target.eventKinds,
        replayPolicy: target.replayPolicy,
      }),
    ],
    events: ["basicTool.mcp.subscribe.dryRun"],
  };
}
