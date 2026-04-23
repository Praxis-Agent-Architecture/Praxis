/*
 * 文件定位：Agent 执行引擎 / 基础工具原语层 / 基础工具集合 / MCP 基础工具 / MCP 资源。
 * 核心目的：提供 MCP 基础工具 / MCP 资源 中的“读取资源”基础能力原语。
 * 能力要求1：需要定义该能力的输入、输出、错误、权限需求和可观测事件。
 * 能力要求2：这些基础工具是 Agent 成立的底层能力，不是 TAP 的最终高级工具库。
 * 能力要求3：后续 TAP 可以基于这些原语构建更强的工具编排、审批、替换和专业能力库。
 * 边界：保留 Agent 基础工具原语，不替代 TAP 的高级工具系统。
 * 对接：需要被 runtime.execEngine 拉起，并和 mainLoop、stateEngine、事件暴露、工具调用策略接通。
 * 实现提示：先补稳定类型契约、最小可测行为和清晰错误边界，再接入真实执行逻辑。
 */

export type McpReadResourcePermission = "mcp:resource:read";

export type McpReadResourceErrorBoundary = "input" | "scope" | "permission" | "contract" | "governance";

export type McpReadResourceGate = {
  accepted: boolean;
  reason?: string;
};

export type McpReadResourceContext = {
  runtimeId?: string;
  invocationId?: string;
  dryRun?: boolean;
  requestedScopes?: readonly string[];
  allowedScopes?: readonly string[];
  grantedPermissions?: readonly McpReadResourcePermission[];
  contract?: McpReadResourceGate;
  governance?: McpReadResourceGate;
  auditMetadata?: Readonly<Record<string, unknown>>;
};

export type McpReadResourceTarget = {
  serverId: string;
  resourceUri: string;
  acceptMimeTypes?: readonly string[];
  maxBytes?: number;
};

export type McpReadResourceRequest = {
  target?: Partial<McpReadResourceTarget>;
  context?: McpReadResourceContext;
};

export type McpReadResourceContentEnvelope = {
  uri: string;
  contents: readonly {
    mimeType?: string;
    text?: string;
    bytesBase64?: string;
  }[];
  truncated: boolean;
  source: "mockable-envelope";
};

export type McpReadResourceErrorCode =
  | "MISSING_SERVER_ID"
  | "MISSING_RESOURCE_URI"
  | "INVALID_MAX_BYTES"
  | "SCOPE_DENIED"
  | "PERMISSION_DENIED"
  | "CONTRACT_REJECTED"
  | "GOVERNANCE_REJECTED"
  | "REAL_EXECUTION_BLOCKED";

export type McpReadResourceError = {
  code: McpReadResourceErrorCode;
  message: string;
  boundary: McpReadResourceErrorBoundary;
  publicSafe: true;
  internalDetailExposed: false;
};

export type McpReadResourceAuditEvent = {
  type: string;
  toolId: "mcp.readResource";
  invocationId: string;
  dryRun: boolean;
  serverId?: string;
  resourceUri?: string;
  metadata: Readonly<Record<string, unknown>>;
};

export type McpReadResourceOutput = {
  kind: "agentCore.basicTool.mcp.readResource";
  target: McpReadResourceTarget;
  dryRun: true;
  executionBlocked: true;
  permissionsRequired: readonly McpReadResourcePermission[];
  unsafeSideEffects: false;
  acceptedScopes: readonly string[];
  resourceEnvelope: McpReadResourceContentEnvelope;
};

export type McpReadResourceResult =
  | {
      ok: true;
      toolId: "mcp.readResource";
      output: McpReadResourceOutput;
      audit: readonly McpReadResourceAuditEvent[];
      events: readonly string[];
    }
  | {
      ok: false;
      toolId: "mcp.readResource";
      error: McpReadResourceError;
      audit: readonly McpReadResourceAuditEvent[];
      events: readonly string[];
    };

export const mcpReadResourceDescriptor = {
  toolId: "mcp.readResource",
  capability: "read-mcp-resource",
  route: "agent_executionEngine.basic_toolLayer.baseTools.mcpBase.resource",
  defaultDryRun: true,
  tapOwnsApproval: true,
  permissionsRequired: ["mcp:resource:read"],
  unsafeSideEffects: false,
} as const;

function cleanList(values: readonly string[] | undefined): readonly string[] {
  return [...new Set((values ?? []).map((value) => value.trim()).filter(Boolean))];
}

function isBlank(value: string | undefined): boolean {
  return typeof value !== "string" || value.trim().length === 0;
}

function invocationId(context: McpReadResourceContext | undefined): string {
  return context?.invocationId?.trim() || "mcp.readResource:dry-run";
}

function dryRunEnabled(context: McpReadResourceContext | undefined): boolean {
  return context?.dryRun !== false;
}

function auditEvent(
  type: string,
  context: McpReadResourceContext | undefined,
  target?: Partial<McpReadResourceTarget>,
  metadata?: Readonly<Record<string, unknown>>,
): McpReadResourceAuditEvent {
  return {
    type,
    toolId: mcpReadResourceDescriptor.toolId,
    invocationId: invocationId(context),
    dryRun: dryRunEnabled(context),
    serverId: target?.serverId?.trim() || undefined,
    resourceUri: target?.resourceUri?.trim() || undefined,
    metadata: {
      ...(context?.auditMetadata ?? {}),
      ...(metadata ?? {}),
    },
  };
}

function failure(
  code: McpReadResourceErrorCode,
  message: string,
  boundary: McpReadResourceErrorBoundary,
  context: McpReadResourceContext | undefined,
  target?: Partial<McpReadResourceTarget>,
): McpReadResourceResult {
  return {
    ok: false,
    toolId: mcpReadResourceDescriptor.toolId,
    error: { code, message, boundary, publicSafe: true, internalDetailExposed: false },
    audit: [auditEvent("agentCore.basicTool.mcp.readResource.rejected", context, target, { code })],
    events: ["basicTool.mcp.readResource.rejected"],
  };
}

function resolveScopes(
  context: McpReadResourceContext | undefined,
  target: McpReadResourceTarget,
): readonly string[] | McpReadResourceResult {
  const requested = cleanList(context?.requestedScopes);
  const allowed = cleanList(context?.allowedScopes);

  if (requested.length === 0 || allowed.length === 0) {
    return requested;
  }

  const denied = requested.filter((scope) => !allowed.includes(scope));
  if (denied.length > 0) {
    return failure(
      "SCOPE_DENIED",
      `mcp.readResource scope ${denied[0]} is outside runtime governance`,
      "scope",
      context,
      target,
    );
  }

  return requested;
}

function ensurePermissions(
  context: McpReadResourceContext | undefined,
  target: McpReadResourceTarget,
): McpReadResourceResult | undefined {
  const granted = cleanList(context?.grantedPermissions);
  if (granted.length === 0) {
    return undefined;
  }

  const missing = mcpReadResourceDescriptor.permissionsRequired.filter((permission) => !granted.includes(permission));
  if (missing.length === 0) {
    return undefined;
  }

  return failure("PERMISSION_DENIED", `mcp.readResource is missing permissions: ${missing.join(", ")}`, "permission", context, target);
}

function normalizeTarget(
  target: Partial<McpReadResourceTarget> | undefined,
  context: McpReadResourceContext | undefined,
): McpReadResourceTarget | McpReadResourceResult {
  const serverId = target?.serverId?.trim();
  const resourceUri = target?.resourceUri?.trim();

  if (!serverId) {
    return failure("MISSING_SERVER_ID", "mcp.readResource requires target.serverId", "input", context, target);
  }

  if (!resourceUri) {
    return failure("MISSING_RESOURCE_URI", "mcp.readResource requires target.resourceUri", "input", context, target);
  }

  if (target?.maxBytes !== undefined && (!Number.isInteger(target.maxBytes) || target.maxBytes <= 0)) {
    return failure("INVALID_MAX_BYTES", "mcp.readResource target.maxBytes must be a positive integer", "input", context, target);
  }

  return {
    serverId,
    resourceUri,
    acceptMimeTypes: cleanList(target?.acceptMimeTypes),
    maxBytes: target?.maxBytes,
  };
}

export function planMcpResourceRead(request: McpReadResourceRequest = {}): McpReadResourceResult {
  const target = normalizeTarget(request.target, request.context);
  if ("ok" in target) {
    return target;
  }

  if (request.context?.contract?.accepted === false) {
    return failure(
      "CONTRACT_REJECTED",
      request.context.contract.reason ?? "mcp.readResource was rejected by runtime contract surface",
      "contract",
      request.context,
      target,
    );
  }

  if (request.context?.governance?.accepted === false) {
    return failure(
      "GOVERNANCE_REJECTED",
      request.context.governance.reason ?? "mcp.readResource was rejected by runtime governance",
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
      "mcp.readResource only returns a guarded dry-run resource read plan in the first implementation",
      "contract",
      request.context,
      target,
    );
  }

  return {
    ok: true,
    toolId: mcpReadResourceDescriptor.toolId,
    output: {
      kind: "agentCore.basicTool.mcp.readResource",
      target,
      dryRun: true,
      executionBlocked: true,
      permissionsRequired: mcpReadResourceDescriptor.permissionsRequired,
      unsafeSideEffects: false,
      acceptedScopes: scopes,
      resourceEnvelope: {
        uri: target.resourceUri,
        contents: [],
        truncated: false,
        source: "mockable-envelope",
      },
    },
    audit: [
      auditEvent("agentCore.basicTool.mcp.readResource.dryRun", request.context, target, {
        acceptMimeTypes: target.acceptMimeTypes,
        maxBytes: target.maxBytes,
      }),
    ],
    events: ["basicTool.mcp.readResource.dryRun"],
  };
}
