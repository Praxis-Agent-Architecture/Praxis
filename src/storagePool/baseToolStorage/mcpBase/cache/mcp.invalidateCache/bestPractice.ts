import type { BaseToolExecutorPort } from "../../../../../executionEngine/basic_toolLayer/baseTools/baseToolExecutorPort.js";
import type { BaseToolHandler } from "../../../../../executionEngine/basic_toolLayer/baseTools/baseToolDefinition.js";
import { buildMcpPracticeAuditMetadata, createMcpBaseToolDefinition, createMcpCoreHandler, injectRuntimeInvocationMetadata, isJsonObject, jsonSchema } from "../../_shared/baseToolAdapter.js";
import { anthropicMcpInvalidateCachePractice } from "./anthropic.js";
import { deepmindMcpInvalidateCachePractice } from "./deepmind.js";
import { mcpInvalidateCacheDependencyDeclarations, type McpInvalidateCacheDependencies, type McpInvalidateCachePracticeProviderName, type McpInvalidateCacheProviderPractice } from "./dependencies.js";
import { openaiMcpInvalidateCachePractice } from "./openai.js";
import { executeMcpCacheInvalidation as executeMcpCacheInvalidationCore, mcpInvalidateCacheDescriptor, planMcpCacheInvalidation, type McpInvalidateCacheContext, type McpInvalidateCacheOutput, type McpInvalidateCacheProvider, type McpInvalidateCacheRequest, type McpInvalidateCacheResult } from "./core.js";

export * from "./core.js";

export type McpInvalidateCacheBestPracticeRequest = McpInvalidateCacheRequest & { executor?: BaseToolExecutorPort; provider?: McpInvalidateCacheProvider; preferredProvider?: McpInvalidateCachePracticeProviderName };
export type McpInvalidateCacheHandlerInput = Omit<McpInvalidateCacheBestPracticeRequest, "executor">;
export type McpInvalidateCachePracticeSelection = { providerName: McpInvalidateCachePracticeProviderName; practice: McpInvalidateCacheProviderPractice; provider?: McpInvalidateCacheProvider };
export const mcpInvalidateCacheProviderPractices = [anthropicMcpInvalidateCachePractice, openaiMcpInvalidateCachePractice, deepmindMcpInvalidateCachePractice] as const;
export const mcpInvalidateCacheBestPracticeDescriptor = { toolId: "mcp.invalidateCache", bestPractice: "storage-owned-mcp-cache-invalidation-with-runtime-owned-cache-store", providerOrder: ["anthropic", "openai", "deepmind"], dependencies: mcpInvalidateCacheDependencyDeclarations } as const;

function orderedPractices(preferredProvider: McpInvalidateCachePracticeProviderName | undefined): readonly McpInvalidateCacheProviderPractice[] {
  if (preferredProvider === undefined) return mcpInvalidateCacheProviderPractices;
  return [...mcpInvalidateCacheProviderPractices.filter((practice) => practice.providerName === preferredProvider), ...mcpInvalidateCacheProviderPractices.filter((practice) => practice.providerName !== preferredProvider)];
}

export function selectMcpInvalidateCachePractice(dependencies: McpInvalidateCacheDependencies & { preferredProvider?: McpInvalidateCachePracticeProviderName } = {}): McpInvalidateCachePracticeSelection {
  for (const practice of orderedPractices(dependencies.preferredProvider)) {
    const provider = practice.createProvider(dependencies);
    if (provider !== undefined) return { providerName: practice.providerName, practice, provider };
  }
  return { providerName: "praxis-native", practice: { providerName: "praxis-native", source: { kind: "praxis-native", label: "Praxis dry-run fallback" }, directCliSupport: false, sideEffectPolicy: "runtime-owned-client", notes: ["No runtime MCP cache invalidation provider is available; dry-run remains available."], createProvider: () => undefined } };
}

function practiceAuditMetadata(selection: McpInvalidateCachePracticeSelection): Readonly<Record<string, unknown>> {
  return buildMcpPracticeAuditMetadata({ providerName: selection.providerName, sourceLabel: selection.practice.source.label, sourceKind: selection.practice.source.kind, sourcePath: selection.practice.source.path, directCliSupport: selection.practice.directCliSupport, sideEffectPolicy: selection.practice.sideEffectPolicy, notes: selection.practice.notes });
}

export async function executeMcpCacheInvalidation(request: McpInvalidateCacheBestPracticeRequest | unknown = {}): Promise<McpInvalidateCacheResult> {
  const requestRecord = isJsonObject(request) ? (request as McpInvalidateCacheBestPracticeRequest) : {};
  const selection = selectMcpInvalidateCachePractice({ executor: requestRecord.executor, provider: requestRecord.provider, preferredProvider: requestRecord.preferredProvider });
  const context = isJsonObject(requestRecord.context) ? requestRecord.context : undefined;
  return executeMcpCacheInvalidationCore(isJsonObject(request) ? { ...requestRecord, context: { ...context, auditMetadata: { ...(context?.auditMetadata ?? {}), ...practiceAuditMetadata(selection) } } } : request, selection.provider);
}

export const mcpInvalidateCacheBaseToolDefinition = createMcpBaseToolDefinition<McpInvalidateCacheHandlerInput, McpInvalidateCacheOutput>({
  toolId: "mcp.invalidateCache",
  title: "MCP Invalidate Cache",
  description: "Request runtime to invalidate cache material for a configured MCP server.",
  summary: "Use mcp.invalidateCache for governed runtime-owned MCP cache eviction.",
  storageGroup: "cache",
  riskLevel: "risky",
  permissionHints: ["mcp:access", "mcp:cache:invalidate"],
  dependencies: mcpInvalidateCacheDependencyDeclarations,
  inputSchema: jsonSchema("mcp.invalidateCache.input", { type: "object", additionalProperties: true }),
  outputSchema: jsonSchema("mcp.invalidateCache.output", { type: "object", additionalProperties: true }),
});

export const mcpInvalidateCacheHandler: BaseToolHandler<McpInvalidateCacheHandlerInput, McpInvalidateCacheOutput> = createMcpCoreHandler(
  mcpInvalidateCacheBaseToolDefinition,
  async (request) => {
    const selection = selectMcpInvalidateCachePractice({ executor: request.executor, provider: request.input.provider, preferredProvider: request.input.preferredProvider });
    const inputContext = request.input.context ?? {};
    const context: McpInvalidateCacheContext = { ...inputContext, runtimeId: inputContext.runtimeId ?? request.runtimeId, sessionId: inputContext.sessionId ?? request.sessionId, invocationId: inputContext.invocationId ?? request.toolCallId, auditMetadata: injectRuntimeInvocationMetadata({ ...practiceAuditMetadata(selection), ...(request.metadata ?? {}) }, inputContext.auditMetadata, request) };
    return executeMcpCacheInvalidationCore({ ...request.input, context }, selection.provider);
  },
);

export type { McpInvalidateCacheResult };
export { mcpInvalidateCacheDescriptor, planMcpCacheInvalidation };
