import type { BaseToolExecutorPort } from "../../../../../agentCore_executionEngine/basic_toolLayer/baseTools/baseToolExecutorPort.js";
import type { BaseToolHandler } from "../../../../../agentCore_executionEngine/basic_toolLayer/baseTools/baseToolDefinition.js";
import { buildMcpPracticeAuditMetadata, createMcpBaseToolDefinition, createMcpCoreHandler, injectRuntimeInvocationMetadata, isJsonObject, jsonSchema } from "../../_shared/baseToolAdapter.js";
import { anthropicMcpDisconnectPractice } from "./anthropic.js";
import { deepmindMcpDisconnectPractice } from "./deepmind.js";
import { mcpDisconnectDependencyDeclarations, type McpDisconnectDependencies, type McpDisconnectPracticeProviderName, type McpDisconnectProviderPractice } from "./dependencies.js";
import { openaiMcpDisconnectPractice } from "./openai.js";
import { executeMcpDisconnect as executeMcpDisconnectCore, mcpDisconnectDescriptor, planMcpDisconnect, type McpDisconnectContext, type McpDisconnectOutput, type McpDisconnectProvider, type McpDisconnectRequest, type McpDisconnectResult } from "./core.js";

export * from "./core.js";

export type McpDisconnectBestPracticeRequest = McpDisconnectRequest & { executor?: BaseToolExecutorPort; provider?: McpDisconnectProvider; preferredProvider?: McpDisconnectPracticeProviderName };
export type McpDisconnectHandlerInput = Omit<McpDisconnectBestPracticeRequest, "executor">;
export type McpDisconnectPracticeSelection = { providerName: McpDisconnectPracticeProviderName; practice: McpDisconnectProviderPractice; provider?: McpDisconnectProvider };
export const mcpDisconnectProviderPractices = [anthropicMcpDisconnectPractice, openaiMcpDisconnectPractice, deepmindMcpDisconnectPractice] as const;
export const mcpDisconnectBestPracticeDescriptor = { toolId: "mcp.disconnect", bestPractice: "storage-owned-mcp-disconnect-with-runtime-owned-client", providerOrder: ["anthropic", "openai", "deepmind"], dependencies: mcpDisconnectDependencyDeclarations } as const;

function orderedPractices(preferredProvider: McpDisconnectPracticeProviderName | undefined): readonly McpDisconnectProviderPractice[] {
  return preferredProvider === undefined ? mcpDisconnectProviderPractices : [...mcpDisconnectProviderPractices.filter((practice) => practice.providerName === preferredProvider), ...mcpDisconnectProviderPractices.filter((practice) => practice.providerName !== preferredProvider)];
}

export function selectMcpDisconnectPractice(dependencies: McpDisconnectDependencies & { preferredProvider?: McpDisconnectPracticeProviderName } = {}): McpDisconnectPracticeSelection {
  for (const practice of orderedPractices(dependencies.preferredProvider)) {
    const provider = practice.createProvider(dependencies);
    if (provider !== undefined) return { providerName: practice.providerName, practice, provider };
  }
  return { providerName: "praxis-native", practice: { providerName: "praxis-native", source: { kind: "praxis-native", label: "Praxis dry-run fallback" }, directCliSupport: false, sideEffectPolicy: "runtime-owned-client", notes: ["No runtime MCP disconnect provider is available; dry-run remains available."], createProvider: () => undefined } };
}

function practiceAuditMetadata(selection: McpDisconnectPracticeSelection): Readonly<Record<string, unknown>> {
  return buildMcpPracticeAuditMetadata({ providerName: selection.providerName, sourceLabel: selection.practice.source.label, sourceKind: selection.practice.source.kind, sourcePath: selection.practice.source.path, directCliSupport: selection.practice.directCliSupport, sideEffectPolicy: selection.practice.sideEffectPolicy, notes: selection.practice.notes });
}

export async function executeMcpDisconnect(request: McpDisconnectBestPracticeRequest | unknown = {}): Promise<McpDisconnectResult> {
  const requestRecord = isJsonObject(request) ? (request as McpDisconnectBestPracticeRequest) : {};
  const selection = selectMcpDisconnectPractice({ executor: requestRecord.executor, provider: requestRecord.provider, preferredProvider: requestRecord.preferredProvider });
  const context = isJsonObject(requestRecord.context) ? requestRecord.context : undefined;
  return executeMcpDisconnectCore(isJsonObject(request) ? { ...requestRecord, context: { ...context, auditMetadata: { ...(context?.auditMetadata ?? {}), ...practiceAuditMetadata(selection) } } } : request, selection.provider);
}

export const mcpDisconnectBaseToolDefinition = createMcpBaseToolDefinition<McpDisconnectHandlerInput, McpDisconnectOutput>({ toolId: "mcp.disconnect", title: "MCP Disconnect", description: "Request runtime to disconnect a managed MCP server connection.", summary: "Use mcp.disconnect to ask the runtime-owned MCP manager to close or mark an MCP connection.", storageGroup: "connection", riskLevel: "risky", permissionHints: ["mcp:access", "mcp:disconnect"], dependencies: mcpDisconnectDependencyDeclarations, inputSchema: jsonSchema("mcp.disconnect.input", { type: "object", additionalProperties: true }), outputSchema: jsonSchema("mcp.disconnect.output", { type: "object", additionalProperties: true }) });

export const mcpDisconnectHandler: BaseToolHandler<McpDisconnectHandlerInput, McpDisconnectOutput> = createMcpCoreHandler(mcpDisconnectBaseToolDefinition, async (request) => {
  const selection = selectMcpDisconnectPractice({ executor: request.executor, provider: request.input.provider, preferredProvider: request.input.preferredProvider });
  const inputContext = request.input.context ?? {};
  const context: McpDisconnectContext = { ...inputContext, runtimeId: inputContext.runtimeId ?? request.runtimeId, sessionId: inputContext.sessionId ?? request.sessionId, invocationId: inputContext.invocationId ?? request.toolCallId, auditMetadata: injectRuntimeInvocationMetadata({ ...practiceAuditMetadata(selection), ...(request.metadata ?? {}) }, inputContext.auditMetadata, request) };
  return executeMcpDisconnectCore({ ...request.input, context }, selection.provider);
});

export type { McpDisconnectResult };
export { mcpDisconnectDescriptor, planMcpDisconnect };
