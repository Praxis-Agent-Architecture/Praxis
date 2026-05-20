import type { BaseToolDependencyDeclaration } from "../../../../../executionEngine/basic_toolLayer/baseTools/baseToolDefinition.js";
import type { BaseToolExecutorPort } from "../../../../../executionEngine/basic_toolLayer/baseTools/baseToolExecutorPort.js";
import type { McpCreateResourceProvider } from "./core.js";

export type McpCreateResourcePracticeProviderName = "anthropic" | "openai" | "deepmind" | "praxis-native";
export type McpCreateResourceDependencies = { executor?: BaseToolExecutorPort; provider?: McpCreateResourceProvider };
export type McpCreateResourceProviderPractice = { providerName: McpCreateResourcePracticeProviderName; source: { kind: "cli" | "agent-sdk" | "api-sdk" | "praxis-native"; label: string; path?: string }; directCliSupport: boolean; sideEffectPolicy: "runtime-owned-client"; notes: readonly string[]; createProvider(dependencies: McpCreateResourceDependencies): McpCreateResourceProvider | undefined };

export const mcpCreateResourceDependencyDeclarations: readonly BaseToolDependencyDeclaration[] = [
  { dependencyId: "runtime.execEngine.mcp.createResource", kind: "service", required: true, description: "Runtime-owned MCP resource creation support. BaseTool shapes the mutation request and never writes resources directly." },
  { dependencyId: "runtime.governancePlane.mcpApproval", kind: "permission", required: true, description: "dryRun:false requires explicit runtime guard approval before resource creation." },
  { dependencyId: "runtime.mcp.resourceLifecycle", kind: "runtime", required: true, description: "Resource persistence, revisions, conflict checks, transports, and cleanup remain with runtime." },
];

export function createHostExecutorMcpCreateResourceProvider(executor: BaseToolExecutorPort | undefined): McpCreateResourceProvider | undefined {
  const createResource = executor?.mcp?.createResource;
  if (createResource === undefined) return undefined;
  return async (request, context) => {
    const result = await createResource({ ...request, context });
    if (!result.ok) throw new Error(result.error.message);
    return result.output;
  };
}
