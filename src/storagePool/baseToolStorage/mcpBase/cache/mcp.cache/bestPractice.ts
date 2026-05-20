import type { BaseToolExecutorPort } from "../../../../../agentCore_executionEngine/basic_toolLayer/baseTools/baseToolExecutorPort.js";
import type { BaseToolHandler } from "../../../../../agentCore_executionEngine/basic_toolLayer/baseTools/baseToolDefinition.js";
import { buildMcpPracticeAuditMetadata, createMcpBaseToolDefinition, createMcpCoreHandler, injectRuntimeInvocationMetadata, isJsonObject, jsonSchema } from "../../_shared/baseToolAdapter.js";
import { anthropicMcpCachePractice } from "./anthropic.js";
import { deepmindMcpCachePractice } from "./deepmind.js";
import { mcpCacheDependencyDeclarations, type McpCacheDependencies, type McpCachePracticeProviderName, type McpCacheProviderPractice } from "./dependencies.js";
import { openaiMcpCachePractice } from "./openai.js";
import { executeMcpCache as executeMcpCacheCore, mcpCacheDescriptor, planMcpCache, type McpCacheContext, type McpCacheOutput, type McpCacheProvider, type McpCacheRequest, type McpCacheResult } from "./core.js";

export * from "./core.js";

export type McpCacheBestPracticeRequest = McpCacheRequest & { executor?: BaseToolExecutorPort; provider?: McpCacheProvider; preferredProvider?: McpCachePracticeProviderName };
export type McpCacheHandlerInput = Omit<McpCacheBestPracticeRequest, "executor">;
export type McpCachePracticeSelection = { providerName: McpCachePracticeProviderName; practice: McpCacheProviderPractice; provider?: McpCacheProvider };
export const mcpCacheProviderPractices = [anthropicMcpCachePractice, openaiMcpCachePractice, deepmindMcpCachePractice] as const;
export const mcpCacheBestPracticeDescriptor = { toolId: "mcp.cache", bestPractice: "storage-owned-mcp-cache-with-runtime-owned-cache-store", providerOrder: ["anthropic", "openai", "deepmind"], dependencies: mcpCacheDependencyDeclarations } as const;

function orderedPractices(preferredProvider: McpCachePracticeProviderName | undefined): readonly McpCacheProviderPractice[] {
  if (preferredProvider === undefined) return mcpCacheProviderPractices;
  return [...mcpCacheProviderPractices.filter((practice) => practice.providerName === preferredProvider), ...mcpCacheProviderPractices.filter((practice) => practice.providerName !== preferredProvider)];
}

export function selectMcpCachePractice(dependencies: McpCacheDependencies & { preferredProvider?: McpCachePracticeProviderName } = {}): McpCachePracticeSelection {
  for (const practice of orderedPractices(dependencies.preferredProvider)) {
    const provider = practice.createProvider(dependencies);
    if (provider !== undefined) return { providerName: practice.providerName, practice, provider };
  }
  return { providerName: "praxis-native", practice: { providerName: "praxis-native", source: { kind: "praxis-native", label: "Praxis dry-run fallback" }, directCliSupport: false, sideEffectPolicy: "runtime-owned-client", notes: ["No runtime MCP cache provider is available; dry-run remains available."], createProvider: () => undefined } };
}

function practiceAuditMetadata(selection: McpCachePracticeSelection): Readonly<Record<string, unknown>> {
  return buildMcpPracticeAuditMetadata({ providerName: selection.providerName, sourceLabel: selection.practice.source.label, sourceKind: selection.practice.source.kind, sourcePath: selection.practice.source.path, directCliSupport: selection.practice.directCliSupport, sideEffectPolicy: selection.practice.sideEffectPolicy, notes: selection.practice.notes });
}

export async function executeMcpCache(request: McpCacheBestPracticeRequest | unknown = {}): Promise<McpCacheResult> {
  const requestRecord = isJsonObject(request) ? (request as McpCacheBestPracticeRequest) : {};
  const selection = selectMcpCachePractice({ executor: requestRecord.executor, provider: requestRecord.provider, preferredProvider: requestRecord.preferredProvider });
  const context = isJsonObject(requestRecord.context) ? requestRecord.context : undefined;
  return executeMcpCacheCore(isJsonObject(request) ? { ...requestRecord, context: { ...context, auditMetadata: { ...(context?.auditMetadata ?? {}), ...practiceAuditMetadata(selection) } } } : request, selection.provider);
}

export const mcpCacheBaseToolDefinition = createMcpBaseToolDefinition<McpCacheHandlerInput, McpCacheOutput>({
  toolId: "mcp.cache",
  title: "MCP Cache",
  description: "Request runtime to write a cache entry for a configured MCP server.",
  summary: "Use mcp.cache for governed runtime-owned MCP cache writes.",
  storageGroup: "cache",
  riskLevel: "risky",
  permissionHints: ["mcp:access", "mcp:write", "cache:write"],
  dependencies: mcpCacheDependencyDeclarations,
  inputSchema: jsonSchema("mcp.cache.input", { type: "object", additionalProperties: true }),
  outputSchema: jsonSchema("mcp.cache.output", { type: "object", additionalProperties: true }),
});

export const mcpCacheHandler: BaseToolHandler<McpCacheHandlerInput, McpCacheOutput> = createMcpCoreHandler(
  mcpCacheBaseToolDefinition,
  async (request) => {
    const selection = selectMcpCachePractice({ executor: request.executor, provider: request.input.provider, preferredProvider: request.input.preferredProvider });
    const inputContext = request.input.context ?? {};
    const context: McpCacheContext = { ...inputContext, runtimeId: inputContext.runtimeId ?? request.runtimeId, sessionId: inputContext.sessionId ?? request.sessionId, invocationId: inputContext.invocationId ?? request.toolCallId, auditMetadata: injectRuntimeInvocationMetadata({ ...practiceAuditMetadata(selection), ...(request.metadata ?? {}) }, inputContext.auditMetadata, request) };
    return executeMcpCacheCore({ ...request.input, context }, selection.provider);
  },
);

export type { McpCacheResult };
export { mcpCacheDescriptor, planMcpCache };
