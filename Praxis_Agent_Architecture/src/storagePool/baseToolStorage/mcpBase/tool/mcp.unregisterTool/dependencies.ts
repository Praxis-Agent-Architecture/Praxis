import type { BaseToolDependencyDeclaration } from "../../../../../agentCore/agent_executionEngine/basic_toolLayer/baseTools/baseToolDefinition.js";
import type { BaseToolExecutorPort } from "../../../../../agentCore/agent_executionEngine/basic_toolLayer/baseTools/baseToolExecutorPort.js";
import type { UnregisterMcpToolProvider } from "./core.js";

export type McpUnregisterToolPracticeProviderName = "anthropic" | "openai" | "deepmind" | "praxis-native";
export type McpUnregisterToolDependencies = { executor?: BaseToolExecutorPort; provider?: UnregisterMcpToolProvider };
export type McpUnregisterToolProviderPractice = {
  providerName: McpUnregisterToolPracticeProviderName;
  source: { kind: "cli" | "agent-sdk" | "api-sdk" | "praxis-native"; label: string; path?: string };
  directCliSupport: boolean;
  sideEffectPolicy: "runtime-owned-client";
  notes: readonly string[];
  createProvider(dependencies: McpUnregisterToolDependencies): UnregisterMcpToolProvider | undefined;
};

export const mcpUnregisterToolDependencyDeclarations: readonly BaseToolDependencyDeclaration[] = [
  { dependencyId: "runtime.execEngine.mcp.unregisterTool", kind: "service", required: true, description: "Runtime-owned MCP tool unregistration support. BaseTool validates the request and never mutates registry state itself." },
  { dependencyId: "runtime.governancePlane.mcpApproval", kind: "permission", required: true, description: "dryRun:false requires explicit guard approval before unregistering runtime MCP tools." },
];

export function createHostExecutorMcpUnregisterToolProvider(executor: BaseToolExecutorPort | undefined): UnregisterMcpToolProvider | undefined {
  const unregisterTool = executor?.mcp?.unregisterTool;
  if (unregisterTool === undefined) return undefined;
  return async (request, context) => {
    const result = await unregisterTool({ ...request, context });
    if (!result.ok) throw new Error(result.error.message);
    return result.output;
  };
}
