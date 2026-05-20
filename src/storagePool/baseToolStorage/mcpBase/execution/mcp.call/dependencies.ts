import type { BaseToolDependencyDeclaration } from "../../../../../executionEngine/basic_toolLayer/baseTools/baseToolDefinition.js";
import type { BaseToolExecutorPort } from "../../../../../executionEngine/basic_toolLayer/baseTools/baseToolExecutorPort.js";
import type { McpCallProvider } from "./core.js";

export type McpCallPracticeProviderName = "anthropic" | "openai" | "deepmind" | "praxis-native";

export type McpCallDependencies = {
  executor?: BaseToolExecutorPort;
  provider?: McpCallProvider;
};

export type McpCallProviderPractice = {
  providerName: McpCallPracticeProviderName;
  source: {
    kind: "cli" | "agent-sdk" | "api-sdk" | "praxis-native";
    label: string;
    path?: string;
  };
  directCliSupport: boolean;
  sideEffectPolicy: "runtime-governed" | "runtime-owned-client";
  notes: readonly string[];
  createProvider(dependencies: McpCallDependencies): McpCallProvider | undefined;
};

export const mcpCallDependencyDeclarations: readonly BaseToolDependencyDeclaration[] = [
  {
    dependencyId: "runtime.execEngine.mcp.callTool",
    kind: "service",
    required: true,
    description: "Runtime-owned MCP client dispatch. BaseTool passes a normalized call request and never creates a hidden MCP client.",
  },
  {
    dependencyId: "runtime.governancePlane.mcpApproval",
    kind: "permission",
    required: true,
    description: "dryRun:false requires explicit guard/governance approval before invoking the runtime MCP provider.",
  },
  {
    dependencyId: "runtime.mcp.sessionTransport",
    kind: "runtime",
    required: true,
    description: "Connection, session, transport, OAuth, progress, and cancellation remain owned by runtime.",
  },
];

export function createHostExecutorMcpCallProvider(executor: BaseToolExecutorPort | undefined): McpCallProvider | undefined {
  const callTool = executor?.mcp?.callTool;
  if (callTool === undefined) return undefined;

  return async (request, context) => {
    const result = await callTool({
      serverId: request.serverId,
      toolName: request.toolName,
      arguments: request.arguments,
      mode: request.mode,
      timeoutMs: request.timeoutMs,
      context,
    });
    if (!result.ok) {
      throw new Error(result.error.message);
    }
    return result.output;
  };
}
