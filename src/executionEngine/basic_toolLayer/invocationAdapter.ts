import type { BaseToolFamily } from "../../basetool/types.js";

export type BasicToolAdapterFamily = BaseToolFamily | string;

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
  cwd?: string;
  resourceLimits?: unknown;
  [key: string]: unknown;
};

export type RuntimeToolInvocationAdapterResult =
  | {
      ok: true;
      invocation: {
        kind: "agentCore.basicTool.invocation";
        toolId: string;
        family?: BasicToolAdapterFamily;
        operation: string;
        input: Readonly<Record<string, unknown>>;
        context: RuntimeToolInvocationAdapterRequest["context"];
        resourceLimits?: unknown;
        dispatch?: Readonly<Record<string, unknown>>;
        audit: { event: string };
      };
    }
  | {
      ok: false;
      error: {
        code: "INVALID_TOOL_INVOCATION";
        message: string;
        boundary: "input" | "contract";
        publicSafe: true;
      };
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
        message: "runtime tool invocation requires toolId",
        boundary: "input",
        publicSafe: true,
      },
    };
  }
  return {
    ok: true,
    invocation: {
      kind: "agentCore.basicTool.invocation",
      toolId,
      family: request.family,
      operation: request.operation,
      input: request.arguments,
      context: request.context,
      resourceLimits: request.resourceLimits,
      dispatch: {
        cwd: request.cwd,
        family: request.family,
        operation: request.operation,
      },
      audit: { event: `agentCore.basicTool.invocation:${request.context.invocationId}` },
    },
  };
}
