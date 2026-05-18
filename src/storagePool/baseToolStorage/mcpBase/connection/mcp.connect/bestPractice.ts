import type { BaseToolExecutorPort } from "../../../../../agentCore/agent_executionEngine/basic_toolLayer/baseTools/baseToolExecutorPort.js";
import type { BaseToolHandler } from "../../../../../agentCore/agent_executionEngine/basic_toolLayer/baseTools/baseToolDefinition.js";
import { buildMcpPracticeAuditMetadata, createMcpBaseToolDefinition, createMcpCoreHandler, injectRuntimeInvocationMetadata, isJsonObject, jsonSchema } from "../../_shared/baseToolAdapter.js";
import { anthropicMcpConnectPractice } from "./anthropic.js";
import { deepmindMcpConnectPractice } from "./deepmind.js";
import { mcpConnectDependencyDeclarations, type McpConnectDependencies, type McpConnectPracticeProviderName, type McpConnectProviderPractice } from "./dependencies.js";
import { openaiMcpConnectPractice } from "./openai.js";
import { executeMcpConnect as executeMcpConnectCore, mcpConnectDescriptor, planMcpConnect, type McpConnectContext, type McpConnectOutput, type McpConnectProvider, type McpConnectRequest, type McpConnectResult } from "./core.js";

export * from "./core.js";

export type McpConnectBestPracticeRequest = McpConnectRequest & { executor?: BaseToolExecutorPort; provider?: McpConnectProvider; preferredProvider?: McpConnectPracticeProviderName };
export type McpConnectHandlerInput = Omit<McpConnectBestPracticeRequest, "executor">;
export type McpConnectPracticeSelection = { providerName: McpConnectPracticeProviderName; practice: McpConnectProviderPractice; provider?: McpConnectProvider };
export const mcpConnectProviderPractices = [anthropicMcpConnectPractice, openaiMcpConnectPractice, deepmindMcpConnectPractice] as const;
export const mcpConnectBestPracticeDescriptor = { toolId: "mcp.connect", bestPractice: "storage-owned-mcp-connect-with-runtime-owned-client", providerOrder: ["anthropic", "openai", "deepmind"], dependencies: mcpConnectDependencyDeclarations } as const;

function orderedPractices(preferredProvider: McpConnectPracticeProviderName | undefined): readonly McpConnectProviderPractice[] {
  return preferredProvider === undefined ? mcpConnectProviderPractices : [...mcpConnectProviderPractices.filter((practice) => practice.providerName === preferredProvider), ...mcpConnectProviderPractices.filter((practice) => practice.providerName !== preferredProvider)];
}

export function selectMcpConnectPractice(dependencies: McpConnectDependencies & { preferredProvider?: McpConnectPracticeProviderName } = {}): McpConnectPracticeSelection {
  for (const practice of orderedPractices(dependencies.preferredProvider)) {
    const provider = practice.createProvider(dependencies);
    if (provider !== undefined) return { providerName: practice.providerName, practice, provider };
  }
  return { providerName: "praxis-native", practice: { providerName: "praxis-native", source: { kind: "praxis-native", label: "Praxis dry-run fallback" }, directCliSupport: false, sideEffectPolicy: "runtime-owned-client", notes: ["No runtime MCP connect provider is available; dry-run remains available."], createProvider: () => undefined } };
}

function practiceAuditMetadata(selection: McpConnectPracticeSelection): Readonly<Record<string, unknown>> {
  return buildMcpPracticeAuditMetadata({ providerName: selection.providerName, sourceLabel: selection.practice.source.label, sourceKind: selection.practice.source.kind, sourcePath: selection.practice.source.path, directCliSupport: selection.practice.directCliSupport, sideEffectPolicy: selection.practice.sideEffectPolicy, notes: selection.practice.notes });
}

export async function executeMcpConnect(request: McpConnectBestPracticeRequest | unknown = {}): Promise<McpConnectResult> {
  const requestRecord = isJsonObject(request) ? (request as McpConnectBestPracticeRequest) : {};
  const selection = selectMcpConnectPractice({ executor: requestRecord.executor, provider: requestRecord.provider, preferredProvider: requestRecord.preferredProvider });
  const context = isJsonObject(requestRecord.context) ? requestRecord.context : undefined;
  return executeMcpConnectCore(isJsonObject(request) ? { ...requestRecord, context: { ...context, auditMetadata: { ...(context?.auditMetadata ?? {}), ...practiceAuditMetadata(selection) } } } : request, selection.provider);
}

export const mcpConnectBaseToolDefinition = createMcpBaseToolDefinition<McpConnectHandlerInput, McpConnectOutput>({ toolId: "mcp.connect", title: "MCP Connect", description: "Request runtime to connect a configured MCP server.", summary: "Use mcp.connect to ask the runtime-owned MCP manager to establish or reuse a server connection.", storageGroup: "connection", riskLevel: "risky", permissionHints: ["mcp:access", "mcp:connect"], dependencies: mcpConnectDependencyDeclarations, inputSchema: jsonSchema("mcp.connect.input", { type: "object", additionalProperties: true }), outputSchema: jsonSchema("mcp.connect.output", { type: "object", additionalProperties: true }) });

export const mcpConnectHandler: BaseToolHandler<McpConnectHandlerInput, McpConnectOutput> = createMcpCoreHandler(mcpConnectBaseToolDefinition, async (request) => {
  const selection = selectMcpConnectPractice({ executor: request.executor, provider: request.input.provider, preferredProvider: request.input.preferredProvider });
  const inputContext = request.input.context ?? {};
  const context: McpConnectContext = { ...inputContext, runtimeId: inputContext.runtimeId ?? request.runtimeId, sessionId: inputContext.sessionId ?? request.sessionId, invocationId: inputContext.invocationId ?? request.toolCallId, auditMetadata: injectRuntimeInvocationMetadata({ ...practiceAuditMetadata(selection), ...(request.metadata ?? {}) }, inputContext.auditMetadata, request) };
  return executeMcpConnectCore({ ...request.input, context }, selection.provider);
});

export type { McpConnectResult };
export { mcpConnectDescriptor, planMcpConnect };
