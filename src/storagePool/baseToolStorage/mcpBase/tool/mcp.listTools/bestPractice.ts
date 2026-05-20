import type { BaseToolExecutorPort } from "../../../../../agentCore_executionEngine/basic_toolLayer/baseTools/baseToolExecutorPort.js";
import type { BaseToolHandler } from "../../../../../agentCore_executionEngine/basic_toolLayer/baseTools/baseToolDefinition.js";
import { buildMcpPracticeAuditMetadata, createMcpBaseToolDefinition, createMcpCoreHandler, injectRuntimeInvocationMetadata, isJsonObject, jsonSchema } from "../../_shared/baseToolAdapter.js";
import { anthropicMcpListToolsPractice } from "./anthropic.js";
import { deepmindMcpListToolsPractice } from "./deepmind.js";
import { mcpListToolsDependencyDeclarations, type McpListToolsDependencies, type McpListToolsPracticeProviderName, type McpListToolsProviderPractice } from "./dependencies.js";
import { openaiMcpListToolsPractice } from "./openai.js";
import { executeMcpToolsList as executeMcpToolsListCore, mcpListToolsDescriptor, planMcpToolsList, type ListMcpToolsContext, type ListMcpToolsOutput, type ListMcpToolsProvider, type ListMcpToolsRequest, type ListMcpToolsResult } from "./core.js";

export * from "./core.js";

export type McpListToolsBestPracticeRequest = ListMcpToolsRequest & { executor?: BaseToolExecutorPort; provider?: ListMcpToolsProvider; preferredProvider?: McpListToolsPracticeProviderName };
export type McpListToolsHandlerInput = Omit<McpListToolsBestPracticeRequest, "executor">;
export type McpListToolsPracticeSelection = { providerName: McpListToolsPracticeProviderName; practice: McpListToolsProviderPractice; provider?: ListMcpToolsProvider };

export const mcpListToolsProviderPractices = [anthropicMcpListToolsPractice, openaiMcpListToolsPractice, deepmindMcpListToolsPractice] as const;

export const mcpListToolsBestPracticeDescriptor = {
  toolId: "mcp.listTools",
  bestPractice: "storage-owned-mcp-list-tools-with-runtime-owned-client",
  providerOrder: ["anthropic", "openai", "deepmind"],
  dependencies: mcpListToolsDependencyDeclarations,
} as const;

function orderedPractices(preferredProvider: McpListToolsPracticeProviderName | undefined): readonly McpListToolsProviderPractice[] {
  if (preferredProvider === undefined) return mcpListToolsProviderPractices;
  return [...mcpListToolsProviderPractices.filter((practice) => practice.providerName === preferredProvider), ...mcpListToolsProviderPractices.filter((practice) => practice.providerName !== preferredProvider)];
}

export function selectMcpListToolsPractice(dependencies: McpListToolsDependencies & { preferredProvider?: McpListToolsPracticeProviderName } = {}): McpListToolsPracticeSelection {
  for (const practice of orderedPractices(dependencies.preferredProvider)) {
    const provider = practice.createProvider(dependencies);
    if (provider !== undefined) return { providerName: practice.providerName, practice, provider };
  }
  return { providerName: "praxis-native", practice: { providerName: "praxis-native", source: { kind: "praxis-native", label: "Praxis dry-run fallback" }, directCliSupport: false, sideEffectPolicy: "runtime-owned-client", notes: ["No runtime MCP listTools provider is available; dry-run remains available."], createProvider: () => undefined } };
}

function practiceAuditMetadata(selection: McpListToolsPracticeSelection): Readonly<Record<string, unknown>> {
  return buildMcpPracticeAuditMetadata({ providerName: selection.providerName, sourceLabel: selection.practice.source.label, sourceKind: selection.practice.source.kind, sourcePath: selection.practice.source.path, directCliSupport: selection.practice.directCliSupport, sideEffectPolicy: selection.practice.sideEffectPolicy, notes: selection.practice.notes });
}

export async function executeMcpToolsList(request: McpListToolsBestPracticeRequest | unknown = {}): Promise<ListMcpToolsResult> {
  const requestRecord = isJsonObject(request) ? (request as McpListToolsBestPracticeRequest) : {};
  const selection = selectMcpListToolsPractice({ executor: requestRecord.executor, provider: requestRecord.provider, preferredProvider: requestRecord.preferredProvider });
  const context = isJsonObject(requestRecord.context) ? requestRecord.context : undefined;
  return executeMcpToolsListCore(
    isJsonObject(request) ? { ...requestRecord, context: { ...context, auditMetadata: { ...(context?.auditMetadata ?? {}), ...practiceAuditMetadata(selection) } } } : request,
    selection.provider,
  );
}

const invocationContextSchema = { type: "object", additionalProperties: true } as const;

export const mcpListToolsBaseToolDefinition = createMcpBaseToolDefinition<McpListToolsHandlerInput, ListMcpToolsOutput>({
  toolId: "mcp.listTools",
  title: "MCP List Tools",
  description: "List tools from a runtime-owned MCP server client.",
  summary: "Use mcp.listTools to discover tools from a mounted MCP server without owning the client in baseTool.",
  storageGroup: "tool",
  riskLevel: "normal",
  permissionHints: ["mcp:access", "mcp:tool:read"],
  dependencies: mcpListToolsDependencyDeclarations,
  inputSchema: jsonSchema("mcp.listTools.input", { type: "object", additionalProperties: true, properties: { target: { type: "object", additionalProperties: true }, context: invocationContextSchema } }),
  outputSchema: jsonSchema("mcp.listTools.output", { type: "object", additionalProperties: true }),
});

export const mcpListToolsHandler: BaseToolHandler<McpListToolsHandlerInput, ListMcpToolsOutput> = createMcpCoreHandler(
  mcpListToolsBaseToolDefinition,
  async (request) => {
    const selection = selectMcpListToolsPractice({ executor: request.executor, provider: request.input.provider, preferredProvider: request.input.preferredProvider });
    const inputContext = request.input.context ?? {};
    const context: ListMcpToolsContext = { ...inputContext, runtimeId: inputContext.runtimeId ?? request.runtimeId, sessionId: inputContext.sessionId ?? request.sessionId, invocationId: inputContext.invocationId ?? request.toolCallId, auditMetadata: injectRuntimeInvocationMetadata({ ...practiceAuditMetadata(selection), ...(request.metadata ?? {}) }, inputContext.auditMetadata, request) };
    return executeMcpToolsListCore({ ...request.input, context }, selection.provider);
  },
);

export type { ListMcpToolsResult };
export { mcpListToolsDescriptor, planMcpToolsList };
