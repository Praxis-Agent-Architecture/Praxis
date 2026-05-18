import type { BaseToolDependencyDeclaration } from "../../../../../agentCore/agent_executionEngine/basic_toolLayer/baseTools/baseToolDefinition.js";
import type { BaseToolExecutorPort } from "../../../../../agentCore/agent_executionEngine/basic_toolLayer/baseTools/baseToolExecutorPort.js";
import type { McpReadResourceProvider } from "./core.js";

export type McpReadResourcePracticeProviderName = "anthropic" | "openai" | "deepmind" | "praxis-native";
export type McpReadResourceDependencies = { executor?: BaseToolExecutorPort; provider?: McpReadResourceProvider };
export type McpReadResourceProviderPractice = { providerName: McpReadResourcePracticeProviderName; source: { kind: "cli" | "agent-sdk" | "api-sdk" | "praxis-native"; label: string; path?: string }; directCliSupport: boolean; sideEffectPolicy: "runtime-owned-client"; notes: readonly string[]; createProvider(dependencies: McpReadResourceDependencies): McpReadResourceProvider | undefined };

export const mcpReadResourceDependencyDeclarations: readonly BaseToolDependencyDeclaration[] = [
  { dependencyId: "runtime.execEngine.mcp.readResource", kind: "service", required: true, description: "Runtime-owned MCP resources/read support." },
  { dependencyId: "runtime.governancePlane.mcpApproval", kind: "permission", required: true, description: "dryRun:false requires explicit guard approval before querying the runtime MCP client." },
];

export function createHostExecutorMcpReadResourceProvider(executor: BaseToolExecutorPort | undefined): McpReadResourceProvider | undefined {
  const readResource = executor?.mcp?.readResource;
  if (readResource === undefined) return undefined;
  return async (request, context) => {
    const result = await readResource({ ...request, context });
    if (!result.ok) throw new Error(result.error.message);
    return result.output;
  };
}
