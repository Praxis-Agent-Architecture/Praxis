import type { BaseToolDependencyDeclaration } from "../../../../../agentCore/agent_executionEngine/basic_toolLayer/baseTools/baseToolDefinition.js";
import type { BaseToolExecutorPort } from "../../../../../agentCore/agent_executionEngine/basic_toolLayer/baseTools/baseToolExecutorPort.js";
import type { McpHealthCheckProvider } from "./core.js";

export type McpHealthCheckPracticeProviderName = "anthropic" | "openai" | "deepmind" | "praxis-native";
export type McpHealthCheckDependencies = { executor?: BaseToolExecutorPort; provider?: McpHealthCheckProvider };
export type McpHealthCheckProviderPractice = { providerName: McpHealthCheckPracticeProviderName; source: { kind: "cli" | "agent-sdk" | "api-sdk" | "praxis-native"; label: string; path?: string }; directCliSupport: boolean; sideEffectPolicy: "runtime-owned-client"; notes: readonly string[]; createProvider(dependencies: McpHealthCheckDependencies): McpHealthCheckProvider | undefined };
export const mcpHealthCheckDependencyDeclarations: readonly BaseToolDependencyDeclaration[] = [
  { dependencyId: "runtime.execEngine.mcp.checkHealth", kind: "service", required: true, description: "Runtime-owned MCP health check support." },
  { dependencyId: "runtime.governancePlane.mcpApproval", kind: "permission", required: true, description: "dryRun:false requires explicit guard approval before health probing runtime MCP." },
];
export function createHostExecutorMcpHealthCheckProvider(executor: BaseToolExecutorPort | undefined): McpHealthCheckProvider | undefined {
  const checkHealth = executor?.mcp?.checkHealth;
  if (checkHealth === undefined) return undefined;
  return async (request, context) => {
    const result = await checkHealth({ ...request, context });
    if (!result.ok) throw new Error(result.error.message);
    return result.output;
  };
}
