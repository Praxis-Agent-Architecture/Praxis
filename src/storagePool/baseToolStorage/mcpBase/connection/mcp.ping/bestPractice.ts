import type { BaseToolExecutorPort } from "../../../../../executionEngine/basic_toolLayer/baseTools/baseToolExecutorPort.js";
import type { BaseToolHandler } from "../../../../../executionEngine/basic_toolLayer/baseTools/baseToolDefinition.js";
import { buildMcpPracticeAuditMetadata, createMcpBaseToolDefinition, createMcpCoreHandler, injectRuntimeInvocationMetadata, isJsonObject, jsonSchema } from "../../_shared/baseToolAdapter.js";
import { anthropicMcpPingPractice } from "./anthropic.js";
import { deepmindMcpPingPractice } from "./deepmind.js";
import { mcpPingDependencyDeclarations, type McpPingDependencies, type McpPingPracticeProviderName, type McpPingProviderPractice } from "./dependencies.js";
import { openaiMcpPingPractice } from "./openai.js";
import { executeMcpPing as executeMcpPingCore, mcpPingDescriptor, planMcpPing, type McpPingContext, type McpPingOutput, type McpPingProvider, type McpPingRequest, type McpPingResult } from "./core.js";

export * from "./core.js";

export type McpPingBestPracticeRequest = McpPingRequest & { executor?: BaseToolExecutorPort; provider?: McpPingProvider; preferredProvider?: McpPingPracticeProviderName };
export type McpPingHandlerInput = Omit<McpPingBestPracticeRequest, "executor">;
export type McpPingPracticeSelection = { providerName: McpPingPracticeProviderName; practice: McpPingProviderPractice; provider?: McpPingProvider };
export const mcpPingProviderPractices = [anthropicMcpPingPractice, openaiMcpPingPractice, deepmindMcpPingPractice] as const;
export const mcpPingBestPracticeDescriptor = { toolId: "mcp.ping", bestPractice: "storage-owned-mcp-ping-with-runtime-owned-client", providerOrder: ["anthropic", "openai", "deepmind"], dependencies: mcpPingDependencyDeclarations } as const;
function orderedPractices(preferredProvider: McpPingPracticeProviderName | undefined): readonly McpPingProviderPractice[] { return preferredProvider === undefined ? mcpPingProviderPractices : [...mcpPingProviderPractices.filter((practice) => practice.providerName === preferredProvider), ...mcpPingProviderPractices.filter((practice) => practice.providerName !== preferredProvider)]; }
export function selectMcpPingPractice(dependencies: McpPingDependencies & { preferredProvider?: McpPingPracticeProviderName } = {}): McpPingPracticeSelection {
  for (const practice of orderedPractices(dependencies.preferredProvider)) { const provider = practice.createProvider(dependencies); if (provider !== undefined) return { providerName: practice.providerName, practice, provider }; }
  return { providerName: "praxis-native", practice: { providerName: "praxis-native", source: { kind: "praxis-native", label: "Praxis dry-run fallback" }, directCliSupport: false, sideEffectPolicy: "runtime-owned-client", notes: ["No runtime MCP ping provider is available; dry-run remains available."], createProvider: () => undefined } };
}
function practiceAuditMetadata(selection: McpPingPracticeSelection): Readonly<Record<string, unknown>> { return buildMcpPracticeAuditMetadata({ providerName: selection.providerName, sourceLabel: selection.practice.source.label, sourceKind: selection.practice.source.kind, sourcePath: selection.practice.source.path, directCliSupport: selection.practice.directCliSupport, sideEffectPolicy: selection.practice.sideEffectPolicy, notes: selection.practice.notes }); }
export async function executeMcpPing(request: McpPingBestPracticeRequest | unknown = {}): Promise<McpPingResult> {
  const requestRecord = isJsonObject(request) ? (request as McpPingBestPracticeRequest) : {};
  const selection = selectMcpPingPractice({ executor: requestRecord.executor, provider: requestRecord.provider, preferredProvider: requestRecord.preferredProvider });
  const context = isJsonObject(requestRecord.context) ? requestRecord.context : undefined;
  return executeMcpPingCore(isJsonObject(request) ? { ...requestRecord, context: { ...context, auditMetadata: { ...(context?.auditMetadata ?? {}), ...practiceAuditMetadata(selection) } } } : request, selection.provider);
}
export const mcpPingBaseToolDefinition = createMcpBaseToolDefinition<McpPingHandlerInput, McpPingOutput>({ toolId: "mcp.ping", title: "MCP Ping", description: "Ping a runtime-owned MCP server connection.", summary: "Use mcp.ping to probe MCP liveness without owning the MCP client in baseTool.", storageGroup: "connection", riskLevel: "normal", permissionHints: ["mcp:access", "mcp:ping"], dependencies: mcpPingDependencyDeclarations, inputSchema: jsonSchema("mcp.ping.input", { type: "object", additionalProperties: true }), outputSchema: jsonSchema("mcp.ping.output", { type: "object", additionalProperties: true }) });
export const mcpPingHandler: BaseToolHandler<McpPingHandlerInput, McpPingOutput> = createMcpCoreHandler(mcpPingBaseToolDefinition, async (request) => {
  const selection = selectMcpPingPractice({ executor: request.executor, provider: request.input.provider, preferredProvider: request.input.preferredProvider });
  const inputContext = request.input.context ?? {};
  const context: McpPingContext = { ...inputContext, runtimeId: inputContext.runtimeId ?? request.runtimeId, sessionId: inputContext.sessionId ?? request.sessionId, invocationId: inputContext.invocationId ?? request.toolCallId, auditMetadata: injectRuntimeInvocationMetadata({ ...practiceAuditMetadata(selection), ...(request.metadata ?? {}) }, inputContext.auditMetadata, request) };
  return executeMcpPingCore({ ...request.input, context }, selection.provider);
});
export type { McpPingResult };
export { mcpPingDescriptor, planMcpPing };
