import type { BaseToolDependencyDeclaration } from "../../../../../agentCore_executionEngine/basic_toolLayer/baseTools/baseToolDefinition.js";
import type { BaseToolExecutorPort } from "../../../../../agentCore_executionEngine/basic_toolLayer/baseTools/baseToolExecutorPort.js";
import type { McpInvalidateCacheProvider } from "./core.js";

export type McpInvalidateCachePracticeProviderName = "anthropic" | "openai" | "deepmind" | "praxis-native";
export type McpInvalidateCacheDependencies = { executor?: BaseToolExecutorPort; provider?: McpInvalidateCacheProvider };
export type McpInvalidateCacheProviderPractice = {
  providerName: McpInvalidateCachePracticeProviderName;
  source: { kind: "cli" | "agent-sdk" | "api-sdk" | "praxis-native"; label: string; path?: string };
  directCliSupport: boolean;
  sideEffectPolicy: "runtime-owned-client";
  notes: readonly string[];
  createProvider(dependencies: McpInvalidateCacheDependencies): McpInvalidateCacheProvider | undefined;
};

export const mcpInvalidateCacheDependencyDeclarations: readonly BaseToolDependencyDeclaration[] = [
  { dependencyId: "runtime.execEngine.mcp.invalidateCache", kind: "service", required: true, description: "Runtime-owned MCP cache invalidation support. BaseTool shapes server/scope/key/reason and never evicts runtime material directly." },
  { dependencyId: "runtime.governancePlane.mcpApproval", kind: "permission", required: true, description: "dryRun:false requires explicit runtime guard approval before cache invalidation." },
  { dependencyId: "runtime.mcp.cacheStore", kind: "runtime", required: true, description: "Cache indexes, eviction, tenant boundaries, and invalidation fan-out remain with runtime." },
];

export function createHostExecutorMcpInvalidateCacheProvider(executor: BaseToolExecutorPort | undefined): McpInvalidateCacheProvider | undefined {
  const invalidateCache = executor?.mcp?.invalidateCache;
  if (invalidateCache === undefined) return undefined;
  return async (request, context) => {
    const result = await invalidateCache({ ...request, context });
    if (!result.ok) throw new Error(result.error.message);
    return result.output;
  };
}
