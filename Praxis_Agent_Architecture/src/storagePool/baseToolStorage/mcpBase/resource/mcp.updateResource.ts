/*
 * 文件定位：Agent 执行引擎 / 基础工具原语层 / 基础工具集合 / MCP 基础工具 / MCP 资源。
 * 核心目的：提供 MCP 基础工具 / MCP 资源 中的“更新资源”基础能力原语。
 * 能力要求1：需要定义该能力的输入、输出、错误、权限需求和可观测事件。
 * 能力要求2：这些基础工具是 Agent 成立的底层能力，不是 TAP 的最终高级工具库。
 * 能力要求3：后续 TAP 可以基于这些原语构建更强的工具编排、审批、替换和专业能力库。
 * 边界：保留 Agent 基础工具原语，不替代 TAP 的高级工具系统。
 * 对接：需要被 runtime.execEngine 拉起，并和 mainLoop、stateEngine、事件暴露、工具调用策略接通。
 * 实现提示：先补稳定类型契约、最小可测行为和清晰错误边界，再接入真实执行逻辑。
 */

export type McpUpdateResourcePermission = "mcp:resource:write";

export type McpUpdateResourceErrorBoundary = "input" | "scope" | "permission" | "contract" | "governance";

export type McpUpdateResourceGate = {
  accepted: boolean;
  reason?: string;
};

export type McpUpdateResourceContext = {
  runtimeId?: string;
  invocationId?: string;
  dryRun?: boolean;
  requestedScopes?: readonly string[];
  allowedScopes?: readonly string[];
  grantedPermissions?: readonly McpUpdateResourcePermission[];
  contract?: McpUpdateResourceGate;
  governance?: McpUpdateResourceGate;
  auditMetadata?: Readonly<Record<string, unknown>>;
};

export type McpUpdateResourceContent = {
  mimeType?: string;
  text?: string;
  bytesBase64?: string;
  metadata?: Readonly<Record<string, unknown>>;
};

export type McpUpdateResourceTarget = {
  serverId: string;
  resourceUri: string;
  content: McpUpdateResourceContent;
  expectedRevision?: string;
};

export type McpUpdateResourceRequest = {
  target?: Partial<Omit<McpUpdateResourceTarget, "content">> & {
    content?: McpUpdateResourceContent;
  };
  context?: McpUpdateResourceContext;
};

export type McpUpdateResourceMutationEnvelope = {
  uri: string;
  expectedRevision?: string;
  contentKind: "text" | "bytes" | "metadata" | "mixed";
  committed: false;
  source: "mockable-envelope";
};

export type McpUpdateResourceErrorCode =
  | "MISSING_SERVER_ID"
  | "MISSING_RESOURCE_URI"
  | "MISSING_CONTENT"
  | "INVALID_CONTENT"
  | "SCOPE_DENIED"
  | "PERMISSION_DENIED"
  | "CONTRACT_REJECTED"
  | "GOVERNANCE_REJECTED"
  | "REAL_EXECUTION_BLOCKED";

export type McpUpdateResourceError = {
  code: McpUpdateResourceErrorCode;
  message: string;
  boundary: McpUpdateResourceErrorBoundary;
  publicSafe: true;
  internalDetailExposed: false;
};

export type McpUpdateResourceAuditEvent = {
  type: string;
  toolId: "mcp.updateResource";
  invocationId: string;
  dryRun: boolean;
  serverId?: string;
  resourceUri?: string;
  metadata: Readonly<Record<string, unknown>>;
};

export type McpUpdateResourceOutput = {
  kind: "agentCore.basicTool.mcp.updateResource";
  target: McpUpdateResourceTarget;
  dryRun: true;
  executionBlocked: true;
  permissionsRequired: readonly McpUpdateResourcePermission[];
  unsafeSideEffects: false;
  acceptedScopes: readonly string[];
  mutationEnvelope: McpUpdateResourceMutationEnvelope;
};

export type McpUpdateResourceResult =
  | {
      ok: true;
      toolId: "mcp.updateResource";
      output: McpUpdateResourceOutput;
      audit: readonly McpUpdateResourceAuditEvent[];
      events: readonly string[];
    }
  | {
      ok: false;
      toolId: "mcp.updateResource";
      error: McpUpdateResourceError;
      audit: readonly McpUpdateResourceAuditEvent[];
      events: readonly string[];
    };

export const mcpUpdateResourceDescriptor = {
  toolId: "mcp.updateResource",
  capability: "update-mcp-resource",
  route: "agent_executionEngine.basic_toolLayer.baseTools.mcpBase.resource",
  defaultDryRun: true,
  tapOwnsApproval: true,
  permissionsRequired: ["mcp:resource:write"],
  unsafeSideEffects: false,
} as const;

function cleanList(values: readonly string[] | undefined): readonly string[] {
  return [...new Set((values ?? []).map((value) => value.trim()).filter(Boolean))];
}

function isBlank(value: string | undefined): boolean {
  return typeof value !== "string" || value.trim().length === 0;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function invocationId(context: McpUpdateResourceContext | undefined): string {
  return context?.invocationId?.trim() || "mcp.updateResource:dry-run";
}

function dryRunEnabled(context: McpUpdateResourceContext | undefined): boolean {
  return context?.dryRun !== false;
}

function auditEvent(
  type: string,
  context: McpUpdateResourceContext | undefined,
  target?: Partial<McpUpdateResourceTarget>,
  metadata?: Readonly<Record<string, unknown>>,
): McpUpdateResourceAuditEvent {
  return {
    type,
    toolId: mcpUpdateResourceDescriptor.toolId,
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
  code: McpUpdateResourceErrorCode,
  message: string,
  boundary: McpUpdateResourceErrorBoundary,
  context: McpUpdateResourceContext | undefined,
  target?: Partial<McpUpdateResourceTarget>,
): McpUpdateResourceResult {
  return {
    ok: false,
    toolId: mcpUpdateResourceDescriptor.toolId,
    error: { code, message, boundary, publicSafe: true, internalDetailExposed: false },
    audit: [auditEvent("agentCore.basicTool.mcp.updateResource.rejected", context, target, { code })],
    events: ["basicTool.mcp.updateResource.rejected"],
  };
}

function contentKind(content: McpUpdateResourceContent): McpUpdateResourceMutationEnvelope["contentKind"] {
  const kinds = [
    !isBlank(content.text) ? "text" : undefined,
    !isBlank(content.bytesBase64) ? "bytes" : undefined,
    content.metadata !== undefined && Object.keys(content.metadata).length > 0 ? "metadata" : undefined,
  ].filter((kind): kind is "text" | "bytes" | "metadata" => kind !== undefined);

  return kinds.length === 1 ? kinds[0] : "mixed";
}

function validateContent(
  content: McpUpdateResourceContent | undefined,
  context: McpUpdateResourceContext | undefined,
  target?: Partial<McpUpdateResourceTarget>,
): McpUpdateResourceContent | McpUpdateResourceResult {
  if (content === undefined) {
    return failure("MISSING_CONTENT", "mcp.updateResource requires target.content", "input", context, target);
  }

  if (content.metadata !== undefined && !isRecord(content.metadata)) {
    return failure("INVALID_CONTENT", "mcp.updateResource target.content.metadata must be a plain record", "input", context, target);
  }

  const hasText = !isBlank(content.text);
  const hasBytes = !isBlank(content.bytesBase64);
  const hasMetadata = content.metadata !== undefined && Object.keys(content.metadata).length > 0;

  if (!hasText && !hasBytes && !hasMetadata) {
    return failure(
      "INVALID_CONTENT",
      "mcp.updateResource target.content must include text, bytesBase64, or metadata",
      "input",
      context,
      target,
    );
  }

  return {
    mimeType: content.mimeType?.trim() || undefined,
    text: content.text,
    bytesBase64: content.bytesBase64,
    metadata: content.metadata,
  };
}

function normalizeTarget(
  target: McpUpdateResourceRequest["target"] | undefined,
  context: McpUpdateResourceContext | undefined,
): McpUpdateResourceTarget | McpUpdateResourceResult {
  const serverId = target?.serverId?.trim();
  const resourceUri = target?.resourceUri?.trim();

  if (!serverId) {
    return failure("MISSING_SERVER_ID", "mcp.updateResource requires target.serverId", "input", context, target);
  }

  if (!resourceUri) {
    return failure("MISSING_RESOURCE_URI", "mcp.updateResource requires target.resourceUri", "input", context, target);
  }

  const content = validateContent(target?.content, context, target);
  if ("ok" in content) {
    return content;
  }

  return {
    serverId,
    resourceUri,
    content,
    expectedRevision: target?.expectedRevision?.trim() || undefined,
  };
}

function resolveScopes(
  context: McpUpdateResourceContext | undefined,
  target: McpUpdateResourceTarget,
): readonly string[] | McpUpdateResourceResult {
  const requested = cleanList(context?.requestedScopes);
  const allowed = cleanList(context?.allowedScopes);

  if (requested.length === 0 || allowed.length === 0) {
    return requested;
  }

  const denied = requested.filter((scope) => !allowed.includes(scope));
  if (denied.length > 0) {
    return failure(
      "SCOPE_DENIED",
      `mcp.updateResource scope ${denied[0]} is outside runtime governance`,
      "scope",
      context,
      target,
    );
  }

  return requested;
}

function ensurePermissions(
  context: McpUpdateResourceContext | undefined,
  target: McpUpdateResourceTarget,
): McpUpdateResourceResult | undefined {
  const granted = cleanList(context?.grantedPermissions);
  if (granted.length === 0) {
    return undefined;
  }

  const missing = mcpUpdateResourceDescriptor.permissionsRequired.filter((permission) => !granted.includes(permission));
  if (missing.length === 0) {
    return undefined;
  }

  return failure("PERMISSION_DENIED", `mcp.updateResource is missing permissions: ${missing.join(", ")}`, "permission", context, target);
}

export function planMcpResourceUpdate(request: McpUpdateResourceRequest = {}): McpUpdateResourceResult {
  const target = normalizeTarget(request.target, request.context);
  if ("ok" in target) {
    return target;
  }

  if (request.context?.contract?.accepted === false) {
    return failure(
      "CONTRACT_REJECTED",
      request.context.contract.reason ?? "mcp.updateResource was rejected by runtime contract surface",
      "contract",
      request.context,
      target,
    );
  }

  if (request.context?.governance?.accepted === false) {
    return failure(
      "GOVERNANCE_REJECTED",
      request.context.governance.reason ?? "mcp.updateResource was rejected by runtime governance",
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
      "mcp.updateResource only returns a guarded dry-run resource update plan in the first implementation",
      "contract",
      request.context,
      target,
    );
  }

  return {
    ok: true,
    toolId: mcpUpdateResourceDescriptor.toolId,
    output: {
      kind: "agentCore.basicTool.mcp.updateResource",
      target,
      dryRun: true,
      executionBlocked: true,
      permissionsRequired: mcpUpdateResourceDescriptor.permissionsRequired,
      unsafeSideEffects: false,
      acceptedScopes: scopes,
      mutationEnvelope: {
        uri: target.resourceUri,
        expectedRevision: target.expectedRevision,
        contentKind: contentKind(target.content),
        committed: false,
        source: "mockable-envelope",
      },
    },
    audit: [
      auditEvent("agentCore.basicTool.mcp.updateResource.dryRun", request.context, target, {
        contentKind: contentKind(target.content),
        expectedRevision: target.expectedRevision,
      }),
    ],
    events: ["basicTool.mcp.updateResource.dryRun"],
  };
}
