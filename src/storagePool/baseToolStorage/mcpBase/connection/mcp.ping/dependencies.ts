import type { BaseToolDependencyDeclaration } from "../../../../../agentCore_executionEngine/basic_toolLayer/baseTools/baseToolDefinition.js";
import type { BaseToolExecutorPort } from "../../../../../agentCore_executionEngine/basic_toolLayer/baseTools/baseToolExecutorPort.js";
import type { McpPingProvider } from "./core.js";

export type McpPingPracticeProviderName = "anthropic" | "openai" | "deepmind" | "praxis-native";
export type McpPingDependencies = { executor?: BaseToolExecutorPort; provider?: McpPingProvider };
export type McpPingProviderPractice = { providerName: McpPingPracticeProviderName; source: { kind: "cli" | "agent-sdk" | "api-sdk" | "praxis-native"; label: string; path?: string }; directCliSupport: boolean; sideEffectPolicy: "runtime-owned-client"; notes: readonly string[]; createProvider(dependencies: McpPingDependencies): McpPingProvider | undefined };
export const mcpPingDependencyDeclarations: readonly BaseToolDependencyDeclaration[] = [
  { dependencyId: "runtime.execEngine.mcp.ping", kind: "service", required: true, description: "Runtime-owned MCP ping support." },
  { dependencyId: "runtime.governancePlane.mcpApproval", kind: "permission", required: true, description: "dryRun:false requires explicit guard approval before pinging runtime MCP." },
];
export function createHostExecutorMcpPingProvider(executor: BaseToolExecutorPort | undefined): McpPingProvider | undefined {
  const ping = executor?.mcp?.ping;
  if (ping === undefined) return undefined;
  return async (request, context) => {
    const result = await ping({ ...request, context });
    if (!result.ok) throw new Error(result.error.message);
    return result.output;
  };
}
