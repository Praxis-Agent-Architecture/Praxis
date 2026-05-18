import type { BaseToolDependencyDeclaration } from "../../../../../agentCore/agent_executionEngine/basic_toolLayer/baseTools/baseToolDefinition.js";
import type { BaseToolExecutorPort } from "../../../../../agentCore/agent_executionEngine/basic_toolLayer/baseTools/baseToolExecutorPort.js";
import type { McpConnectProvider } from "./core.js";

export type McpConnectPracticeProviderName = "anthropic" | "openai" | "deepmind" | "praxis-native";

export type McpConnectDependencies = {
  executor?: BaseToolExecutorPort;
  provider?: McpConnectProvider;
};

export type McpConnectProviderPractice = {
  providerName: McpConnectPracticeProviderName;
  source: { kind: "cli" | "agent-sdk" | "api-sdk" | "praxis-native"; label: string; path?: string };
  directCliSupport: boolean;
  sideEffectPolicy: "runtime-owned-client";
  notes: readonly string[];
  createProvider(dependencies: McpConnectDependencies): McpConnectProvider | undefined;
};

export const mcpConnectDependencyDeclarations: readonly BaseToolDependencyDeclaration[] = [
  {
    dependencyId: "runtime.execEngine.mcp.connect",
    kind: "service",
    required: true,
    description: "Runtime-owned MCP connection support. BaseTool passes a normalized connection request and never creates a hidden MCP client.",
  },
  {
    dependencyId: "runtime.governancePlane.mcpApproval",
    kind: "permission",
    required: true,
    description: "dryRun:false requires explicit guard/governance approval before asking runtime to connect.",
  },
  {
    dependencyId: "runtime.mcp.sessionTransport",
    kind: "runtime",
    required: true,
    description: "Session, transport, OAuth, reconnect, and progress ownership remain with runtime.",
  },
];

export function createHostExecutorMcpConnectProvider(executor: BaseToolExecutorPort | undefined): McpConnectProvider | undefined {
  const connect = executor?.mcp?.connect;
  if (connect === undefined) return undefined;
  return async (request, context) => {
    const result = await connect({ ...request, context });
    if (!result.ok) throw new Error(result.error.message);
    return result.output;
  };
}
