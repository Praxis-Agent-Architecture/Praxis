export type BasicToolAdapterFamily =
  | "code"
  | "shell"
  | "git"
  | "mcp"
  | "computeruse"
  | "office"
  | "omni"
  | "search"
  | "skill"
  | "custom";

export type RuntimeToolInvocationAdapterRequest = {
  context: {
    runtimeId: string;
    sessionId: string;
    invocationId: string;
    requestedScopes?: readonly string[];
    allowedScopes?: readonly string[];
    contract?: unknown;
    governance?: unknown;
    auditMetadata?: Readonly<Record<string, unknown>>;
  };
  toolId: string;
  family?: BasicToolAdapterFamily;
  operation: string;
  arguments: Readonly<Record<string, unknown>>;
  resourceLimits?: Readonly<Record<string, unknown>>;
};

export type RuntimeToolInvocationAdapterResult =
  | {
      ok: true;
      invocation: {
        invocationId: string;
        runtimeId: string;
        sessionId: string;
        toolId: string;
        family?: BasicToolAdapterFamily;
        operation: string;
        arguments: Readonly<Record<string, unknown>>;
        resourceLimits?: Readonly<Record<string, unknown>>;
        audit: {
          event: string;
          metadata?: Readonly<Record<string, unknown>>;
        };
      };
      events: readonly string[];
    }
  | {
      ok: false;
      error: {
        code: "INVALID_TOOL_INVOCATION";
        message: string;
        boundary: "input" | "contract" | "governance";
        publicSafe: true;
      };
      events: readonly string[];
    };

export function adaptRuntimeToolInvocation(
  request: RuntimeToolInvocationAdapterRequest,
): RuntimeToolInvocationAdapterResult {
  const toolId = request.toolId.trim();
  if (toolId.length === 0) {
    return {
      ok: false,
      error: {
        code: "INVALID_TOOL_INVOCATION",
        message: "toolId is required",
        boundary: "input",
        publicSafe: true,
      },
      events: ["agentCore.basicTool.invocationAdapter.rejected"],
    };
  }

  return {
    ok: true,
    invocation: {
      invocationId: request.context.invocationId,
      runtimeId: request.context.runtimeId,
      sessionId: request.context.sessionId,
      toolId,
      family: request.family,
      operation: request.operation,
      arguments: request.arguments,
      resourceLimits: request.resourceLimits,
      audit: {
        event: `baseTool.${toolId}.invocation`,
        metadata: request.context.auditMetadata,
      },
    },
    events: ["agentCore.basicTool.invocationAdapter.accepted"],
  };
}
