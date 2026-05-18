import type { BaseToolDependencyDeclaration } from "../../../../../agentCore/agent_executionEngine/basic_toolLayer/baseTools/baseToolDefinition.js";
import type { BaseToolExecutorPort } from "../../../../../agentCore/agent_executionEngine/basic_toolLayer/baseTools/baseToolExecutorPort.js";
import type { McpUpdateResourceProvider } from "./core.js";

export type McpUpdateResourcePracticeProviderName = "anthropic" | "openai" | "deepmind" | "praxis-native";
export type McpUpdateResourceDependencies = { executor?: BaseToolExecutorPort; provider?: McpUpdateResourceProvider };
export type McpUpdateResourceProviderPractice = { providerName: McpUpdateResourcePracticeProviderName; source: { kind: "cli" | "agent-sdk" | "api-sdk" | "praxis-native"; label: string; path?: string }; directCliSupport: boolean; sideEffectPolicy: "runtime-owned-client"; notes: readonly string[]; createProvider(dependencies: McpUpdateResourceDependencies): McpUpdateResourceProvider | undefined };

export const mcpUpdateResourceDependencyDeclarations: readonly BaseToolDependencyDeclaration[] = [
  { dependencyId: "runtime.execEngine.mcp.updateResource", kind: "service", required: true, description: "Runtime-owned MCP resource update support. BaseTool shapes content/revision semantics and never writes resources directly." },
  { dependencyId: "runtime.governancePlane.mcpApproval", kind: "permission", required: true, description: "dryRun:false requires explicit runtime guard approval before resource update." },
  { dependencyId: "runtime.mcp.resourceLifecycle", kind: "runtime", required: true, description: "Resource persistence, revision conflicts, transports, and cleanup remain with runtime." },
];

export function createHostExecutorMcpUpdateResourceProvider(executor: BaseToolExecutorPort | undefined): McpUpdateResourceProvider | undefined {
  const updateResource = executor?.mcp?.updateResource;
  if (updateResource === undefined) return undefined;
  return async (request, context) => {
    const result = await updateResource({ ...request, context });
    if (!result.ok) throw new Error(result.error.message);
    return result.output;
  };
}
