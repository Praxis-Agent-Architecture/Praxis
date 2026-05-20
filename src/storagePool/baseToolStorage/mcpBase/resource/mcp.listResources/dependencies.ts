import type { BaseToolDependencyDeclaration } from "../../../../../agentCore_executionEngine/basic_toolLayer/baseTools/baseToolDefinition.js";
import type { BaseToolExecutorPort } from "../../../../../agentCore_executionEngine/basic_toolLayer/baseTools/baseToolExecutorPort.js";
import type { McpListResourcesProvider } from "./core.js";

export type McpListResourcesPracticeProviderName = "anthropic" | "openai" | "deepmind" | "praxis-native";
export type McpListResourcesDependencies = { executor?: BaseToolExecutorPort; provider?: McpListResourcesProvider };
export type McpListResourcesProviderPractice = { providerName: McpListResourcesPracticeProviderName; source: { kind: "cli" | "agent-sdk" | "api-sdk" | "praxis-native"; label: string; path?: string }; directCliSupport: boolean; sideEffectPolicy: "runtime-owned-client"; notes: readonly string[]; createProvider(dependencies: McpListResourcesDependencies): McpListResourcesProvider | undefined };

export const mcpListResourcesDependencyDeclarations: readonly BaseToolDependencyDeclaration[] = [
  { dependencyId: "runtime.execEngine.mcp.listResources", kind: "service", required: true, description: "Runtime-owned MCP resources/list support." },
  { dependencyId: "runtime.governancePlane.mcpApproval", kind: "permission", required: true, description: "dryRun:false requires explicit guard approval before querying the runtime MCP client." },
];

export function createHostExecutorMcpListResourcesProvider(executor: BaseToolExecutorPort | undefined): McpListResourcesProvider | undefined {
  const listResources = executor?.mcp?.listResources;
  if (listResources === undefined) return undefined;
  return async (request, context) => {
    const result = await listResources({ ...request, context });
    if (!result.ok) throw new Error(result.error.message);
    return { ...result.output, exhausted: result.output.exhausted ?? false };
  };
}
