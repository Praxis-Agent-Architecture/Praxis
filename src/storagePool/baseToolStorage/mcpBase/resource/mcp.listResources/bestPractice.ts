import type { BaseToolExecutorPort } from "../../../../../agentCore_executionEngine/basic_toolLayer/baseTools/baseToolExecutorPort.js";
import type { BaseToolHandler } from "../../../../../agentCore_executionEngine/basic_toolLayer/baseTools/baseToolDefinition.js";
import { buildMcpPracticeAuditMetadata, createMcpBaseToolDefinition, createMcpCoreHandler, injectRuntimeInvocationMetadata, isJsonObject, jsonSchema } from "../../_shared/baseToolAdapter.js";
import { anthropicMcpListResourcesPractice } from "./anthropic.js";
import { deepmindMcpListResourcesPractice } from "./deepmind.js";
import { mcpListResourcesDependencyDeclarations, type McpListResourcesDependencies, type McpListResourcesPracticeProviderName, type McpListResourcesProviderPractice } from "./dependencies.js";
import { openaiMcpListResourcesPractice } from "./openai.js";
import { executeMcpListResources as executeMcpListResourcesCore, mcpListResourcesDescriptor, planMcpListResources, type McpListResourcesContext, type McpListResourcesOutput, type McpListResourcesProvider, type McpListResourcesRequest, type McpListResourcesResult } from "./core.js";

export * from "./core.js";

export type McpListResourcesBestPracticeRequest = McpListResourcesRequest & { executor?: BaseToolExecutorPort; provider?: McpListResourcesProvider; preferredProvider?: McpListResourcesPracticeProviderName };
export type McpListResourcesHandlerInput = Omit<McpListResourcesBestPracticeRequest, "executor">;
export type McpListResourcesPracticeSelection = { providerName: McpListResourcesPracticeProviderName; practice: McpListResourcesProviderPractice; provider?: McpListResourcesProvider };
export const mcpListResourcesProviderPractices = [anthropicMcpListResourcesPractice, openaiMcpListResourcesPractice, deepmindMcpListResourcesPractice] as const;
export const mcpListResourcesBestPracticeDescriptor = { toolId: "mcp.listResources", bestPractice: "storage-owned-mcp-list-resources-with-runtime-owned-client", providerOrder: ["anthropic", "openai", "deepmind"], dependencies: mcpListResourcesDependencyDeclarations } as const;

function orderedPractices(preferredProvider: McpListResourcesPracticeProviderName | undefined): readonly McpListResourcesProviderPractice[] {
  if (preferredProvider === undefined) return mcpListResourcesProviderPractices;
  return [...mcpListResourcesProviderPractices.filter((practice) => practice.providerName === preferredProvider), ...mcpListResourcesProviderPractices.filter((practice) => practice.providerName !== preferredProvider)];
}

export function selectMcpListResourcesPractice(dependencies: McpListResourcesDependencies & { preferredProvider?: McpListResourcesPracticeProviderName } = {}): McpListResourcesPracticeSelection {
  for (const practice of orderedPractices(dependencies.preferredProvider)) {
    const provider = practice.createProvider(dependencies);
    if (provider !== undefined) return { providerName: practice.providerName, practice, provider };
  }
  return { providerName: "praxis-native", practice: { providerName: "praxis-native", source: { kind: "praxis-native", label: "Praxis dry-run fallback" }, directCliSupport: false, sideEffectPolicy: "runtime-owned-client", notes: ["No runtime MCP listResources provider is available; dry-run remains available."], createProvider: () => undefined } };
}

function practiceAuditMetadata(selection: McpListResourcesPracticeSelection): Readonly<Record<string, unknown>> {
  return buildMcpPracticeAuditMetadata({ providerName: selection.providerName, sourceLabel: selection.practice.source.label, sourceKind: selection.practice.source.kind, sourcePath: selection.practice.source.path, directCliSupport: selection.practice.directCliSupport, sideEffectPolicy: selection.practice.sideEffectPolicy, notes: selection.practice.notes });
}

export async function executeMcpListResources(request: McpListResourcesBestPracticeRequest | unknown = {}): Promise<McpListResourcesResult> {
  const requestRecord = isJsonObject(request) ? (request as McpListResourcesBestPracticeRequest) : {};
  const selection = selectMcpListResourcesPractice({ executor: requestRecord.executor, provider: requestRecord.provider, preferredProvider: requestRecord.preferredProvider });
  const context = isJsonObject(requestRecord.context) ? requestRecord.context : undefined;
  return executeMcpListResourcesCore(isJsonObject(request) ? { ...requestRecord, context: { ...context, auditMetadata: { ...(context?.auditMetadata ?? {}), ...practiceAuditMetadata(selection) } } } : request, selection.provider);
}

export const mcpListResourcesBaseToolDefinition = createMcpBaseToolDefinition<McpListResourcesHandlerInput, McpListResourcesOutput>({
  toolId: "mcp.listResources",
  title: "MCP List Resources",
  description: "List resources from a runtime-owned MCP server client.",
  summary: "Use mcp.listResources to discover MCP resources while runtime owns the MCP session.",
  storageGroup: "resource",
  riskLevel: "normal",
  permissionHints: ["mcp:access", "mcp:resource:list"],
  dependencies: mcpListResourcesDependencyDeclarations,
  inputSchema: jsonSchema("mcp.listResources.input", { type: "object", additionalProperties: true }),
  outputSchema: jsonSchema("mcp.listResources.output", { type: "object", additionalProperties: true }),
});

export const mcpListResourcesHandler: BaseToolHandler<McpListResourcesHandlerInput, McpListResourcesOutput> = createMcpCoreHandler(
  mcpListResourcesBaseToolDefinition,
  async (request) => {
    const selection = selectMcpListResourcesPractice({ executor: request.executor, provider: request.input.provider, preferredProvider: request.input.preferredProvider });
    const inputContext = request.input.context ?? {};
    const context: McpListResourcesContext = { ...inputContext, runtimeId: inputContext.runtimeId ?? request.runtimeId, sessionId: inputContext.sessionId ?? request.sessionId, invocationId: inputContext.invocationId ?? request.toolCallId, auditMetadata: injectRuntimeInvocationMetadata({ ...practiceAuditMetadata(selection), ...(request.metadata ?? {}) }, inputContext.auditMetadata, request) };
    return executeMcpListResourcesCore({ ...request.input, context }, selection.provider);
  },
);

export type { McpListResourcesResult };
export { mcpListResourcesDescriptor, planMcpListResources };
