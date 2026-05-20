import type { BaseToolDependencyDeclaration } from "../../../../../executionEngine/basic_toolLayer/baseTools/baseToolDefinition.js";
import type { BaseToolExecutorPort } from "../../../../../executionEngine/basic_toolLayer/baseTools/baseToolExecutorPort.js";
import type { McpDeleteResourceProvider } from "./core.js";

export type McpDeleteResourcePracticeProviderName = "anthropic" | "openai" | "deepmind" | "praxis-native";
export type McpDeleteResourceDependencies = { executor?: BaseToolExecutorPort; provider?: McpDeleteResourceProvider };
export type McpDeleteResourceProviderPractice = { providerName: McpDeleteResourcePracticeProviderName; source: { kind: "cli" | "agent-sdk" | "api-sdk" | "praxis-native"; label: string; path?: string }; directCliSupport: boolean; sideEffectPolicy: "runtime-owned-client"; notes: readonly string[]; createProvider(dependencies: McpDeleteResourceDependencies): McpDeleteResourceProvider | undefined };

export const mcpDeleteResourceDependencyDeclarations: readonly BaseToolDependencyDeclaration[] = [
  { dependencyId: "runtime.execEngine.mcp.deleteResource", kind: "service", required: true, description: "Runtime-owned MCP resource deletion support. BaseTool shapes the delete request and never deletes resources directly." },
  { dependencyId: "runtime.governancePlane.mcpApproval", kind: "permission", required: true, description: "dryRun:false requires explicit runtime guard approval before resource deletion." },
  { dependencyId: "runtime.mcp.resourceLifecycle", kind: "runtime", required: true, description: "Resource persistence, revision conflicts, tombstones, transports, and cleanup remain with runtime." },
];

export function createHostExecutorMcpDeleteResourceProvider(executor: BaseToolExecutorPort | undefined): McpDeleteResourceProvider | undefined {
  const deleteResource = executor?.mcp?.deleteResource;
  if (deleteResource === undefined) return undefined;
  return async (request, context) => {
    const result = await deleteResource({ ...request, context });
    if (!result.ok) throw new Error(result.error.message);
    return result.output;
  };
}
