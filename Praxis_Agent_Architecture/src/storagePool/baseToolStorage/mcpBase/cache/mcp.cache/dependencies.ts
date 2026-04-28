import type { BaseToolDependencyDeclaration } from "../../../../../agentCore/agent_executionEngine/basic_toolLayer/baseTools/baseToolDefinition.js";
import type { BaseToolExecutorPort } from "../../../../../agentCore/agent_executionEngine/basic_toolLayer/baseTools/baseToolExecutorPort.js";
import type { McpCacheProvider } from "./core.js";

export type McpCachePracticeProviderName = "anthropic" | "openai" | "deepmind" | "praxis-native";
export type McpCacheDependencies = { executor?: BaseToolExecutorPort; provider?: McpCacheProvider };
export type McpCacheProviderPractice = {
  providerName: McpCachePracticeProviderName;
  source: { kind: "cli" | "agent-sdk" | "api-sdk" | "praxis-native"; label: string; path?: string };
  directCliSupport: boolean;
  sideEffectPolicy: "runtime-owned-client";
  notes: readonly string[];
  createProvider(dependencies: McpCacheDependencies): McpCacheProvider | undefined;
};

export const mcpCacheDependencyDeclarations: readonly BaseToolDependencyDeclaration[] = [
  { dependencyId: "runtime.execEngine.mcp.cache", kind: "service", required: true, description: "Runtime-owned MCP cache support. BaseTool shapes cache key/valueRef/TTL/tags and never stores cache material directly." },
  { dependencyId: "runtime.governancePlane.mcpApproval", kind: "permission", required: true, description: "dryRun:false requires explicit runtime guard approval before writing runtime MCP cache entries." },
  { dependencyId: "runtime.mcp.cacheStore", kind: "runtime", required: true, description: "Cache persistence, eviction, tenant isolation, and value material ownership remain with runtime." },
];

export function createHostExecutorMcpCacheProvider(executor: BaseToolExecutorPort | undefined): McpCacheProvider | undefined {
  const cache = executor?.mcp?.cache;
  if (cache === undefined) return undefined;
  return async (request, context) => {
    const result = await cache({ ...request, context });
    if (!result.ok) throw new Error(result.error.message);
    return result.output;
  };
}
