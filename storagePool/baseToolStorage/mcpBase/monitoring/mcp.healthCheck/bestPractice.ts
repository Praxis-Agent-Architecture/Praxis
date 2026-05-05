import type { BaseToolExecutorPort } from "../../../../../agentCore/agent_executionEngine/basic_toolLayer/baseTools/baseToolExecutorPort.js";
import type { BaseToolHandler } from "../../../../../agentCore/agent_executionEngine/basic_toolLayer/baseTools/baseToolDefinition.js";
import { buildMcpPracticeAuditMetadata, createMcpBaseToolDefinition, createMcpCoreHandler, injectRuntimeInvocationMetadata, isJsonObject, jsonSchema } from "../../_shared/baseToolAdapter.js";
import { anthropicMcpHealthCheckPractice } from "./anthropic.js";
import { deepmindMcpHealthCheckPractice } from "./deepmind.js";
import { mcpHealthCheckDependencyDeclarations, type McpHealthCheckDependencies, type McpHealthCheckPracticeProviderName, type McpHealthCheckProviderPractice } from "./dependencies.js";
import { openaiMcpHealthCheckPractice } from "./openai.js";
import { executeMcpHealthCheck as executeMcpHealthCheckCore, mcpHealthCheckDescriptor, planMcpHealthCheck, type McpHealthCheckContext, type McpHealthCheckOutput, type McpHealthCheckProvider, type McpHealthCheckRequest, type McpHealthCheckResult } from "./core.js";

export * from "./core.js";
export type McpHealthCheckBestPracticeRequest = McpHealthCheckRequest & { executor?: BaseToolExecutorPort; provider?: McpHealthCheckProvider; preferredProvider?: McpHealthCheckPracticeProviderName };
export type McpHealthCheckHandlerInput = Omit<McpHealthCheckBestPracticeRequest, "executor">;
export type McpHealthCheckPracticeSelection = { providerName: McpHealthCheckPracticeProviderName; practice: McpHealthCheckProviderPractice; provider?: McpHealthCheckProvider };
export const mcpHealthCheckProviderPractices = [anthropicMcpHealthCheckPractice, openaiMcpHealthCheckPractice, deepmindMcpHealthCheckPractice] as const;
export const mcpHealthCheckBestPracticeDescriptor = { toolId: "mcp.healthCheck", bestPractice: "storage-owned-mcp-health-check-with-runtime-owned-client", providerOrder: ["anthropic", "openai", "deepmind"], dependencies: mcpHealthCheckDependencyDeclarations } as const;
function orderedPractices(preferredProvider: McpHealthCheckPracticeProviderName | undefined): readonly McpHealthCheckProviderPractice[] { return preferredProvider === undefined ? mcpHealthCheckProviderPractices : [...mcpHealthCheckProviderPractices.filter((practice) => practice.providerName === preferredProvider), ...mcpHealthCheckProviderPractices.filter((practice) => practice.providerName !== preferredProvider)]; }
export function selectMcpHealthCheckPractice(dependencies: McpHealthCheckDependencies & { preferredProvider?: McpHealthCheckPracticeProviderName } = {}): McpHealthCheckPracticeSelection {
  for (const practice of orderedPractices(dependencies.preferredProvider)) { const provider = practice.createProvider(dependencies); if (provider !== undefined) return { providerName: practice.providerName, practice, provider }; }
  return { providerName: "praxis-native", practice: { providerName: "praxis-native", source: { kind: "praxis-native", label: "Praxis dry-run fallback" }, directCliSupport: false, sideEffectPolicy: "runtime-owned-client", notes: ["No runtime MCP healthCheck provider is available; dry-run remains available."], createProvider: () => undefined } };
}
function practiceAuditMetadata(selection: McpHealthCheckPracticeSelection): Readonly<Record<string, unknown>> { return buildMcpPracticeAuditMetadata({ providerName: selection.providerName, sourceLabel: selection.practice.source.label, sourceKind: selection.practice.source.kind, sourcePath: selection.practice.source.path, directCliSupport: selection.practice.directCliSupport, sideEffectPolicy: selection.practice.sideEffectPolicy, notes: selection.practice.notes }); }
export async function executeMcpHealthCheck(request: McpHealthCheckBestPracticeRequest | unknown = {}): Promise<McpHealthCheckResult> {
  const requestRecord = isJsonObject(request) ? (request as McpHealthCheckBestPracticeRequest) : {};
  const selection = selectMcpHealthCheckPractice({ executor: requestRecord.executor, provider: requestRecord.provider, preferredProvider: requestRecord.preferredProvider });
  const context = isJsonObject(requestRecord.context) ? requestRecord.context : undefined;
  return executeMcpHealthCheckCore(isJsonObject(request) ? { ...requestRecord, context: { ...context, auditMetadata: { ...(context?.auditMetadata ?? {}), ...practiceAuditMetadata(selection) } } } : request, selection.provider);
}
export const mcpHealthCheckBaseToolDefinition = createMcpBaseToolDefinition<McpHealthCheckHandlerInput, McpHealthCheckOutput>({ toolId: "mcp.healthCheck", title: "MCP Health Check", description: "Check health through a runtime-owned MCP server client.", summary: "Use mcp.healthCheck to inspect MCP server health while runtime owns the session.", storageGroup: "monitoring", riskLevel: "normal", permissionHints: ["mcp:access", "mcp:monitor:read"], dependencies: mcpHealthCheckDependencyDeclarations, inputSchema: jsonSchema("mcp.healthCheck.input", { type: "object", additionalProperties: true }), outputSchema: jsonSchema("mcp.healthCheck.output", { type: "object", additionalProperties: true }) });
export const mcpHealthCheckHandler: BaseToolHandler<McpHealthCheckHandlerInput, McpHealthCheckOutput> = createMcpCoreHandler(mcpHealthCheckBaseToolDefinition, async (request) => {
  const selection = selectMcpHealthCheckPractice({ executor: request.executor, provider: request.input.provider, preferredProvider: request.input.preferredProvider });
  const inputContext = request.input.context ?? {};
  const context: McpHealthCheckContext = { ...inputContext, runtimeId: inputContext.runtimeId ?? request.runtimeId, sessionId: inputContext.sessionId ?? request.sessionId, invocationId: inputContext.invocationId ?? request.toolCallId, auditMetadata: injectRuntimeInvocationMetadata({ ...practiceAuditMetadata(selection), ...(request.metadata ?? {}) }, inputContext.auditMetadata, request) };
  return executeMcpHealthCheckCore({ ...request.input, context }, selection.provider);
});
export type { McpHealthCheckResult };
export { mcpHealthCheckDescriptor, planMcpHealthCheck };
