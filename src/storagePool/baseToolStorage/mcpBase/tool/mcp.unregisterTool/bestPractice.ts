import type { BaseToolExecutorPort } from "../../../../../executionEngine/basic_toolLayer/baseTools/baseToolExecutorPort.js";
import type { BaseToolHandler } from "../../../../../executionEngine/basic_toolLayer/baseTools/baseToolDefinition.js";
import { buildMcpPracticeAuditMetadata, createMcpBaseToolDefinition, createMcpCoreHandler, injectRuntimeInvocationMetadata, isJsonObject, jsonSchema } from "../../_shared/baseToolAdapter.js";
import { anthropicMcpUnregisterToolPractice } from "./anthropic.js";
import { deepmindMcpUnregisterToolPractice } from "./deepmind.js";
import { mcpUnregisterToolDependencyDeclarations, type McpUnregisterToolDependencies, type McpUnregisterToolPracticeProviderName, type McpUnregisterToolProviderPractice } from "./dependencies.js";
import { openaiMcpUnregisterToolPractice } from "./openai.js";
import type { McpToolRegistryContext } from "../mcp.registerTool/core.js";
import { executeMcpToolUnregistration as executeMcpToolUnregistrationCore, planMcpToolUnregistration, type UnregisterMcpToolOutput, type UnregisterMcpToolProvider, type UnregisterMcpToolRequest, type UnregisterMcpToolResult } from "./core.js";

export * from "./core.js";

export type McpUnregisterToolBestPracticeRequest = UnregisterMcpToolRequest & { executor?: BaseToolExecutorPort; provider?: UnregisterMcpToolProvider; preferredProvider?: McpUnregisterToolPracticeProviderName };
export type McpUnregisterToolHandlerInput = Omit<McpUnregisterToolBestPracticeRequest, "executor">;
export type McpUnregisterToolPracticeSelection = { providerName: McpUnregisterToolPracticeProviderName; practice: McpUnregisterToolProviderPractice; provider?: UnregisterMcpToolProvider };
export const mcpUnregisterToolProviderPractices = [anthropicMcpUnregisterToolPractice, openaiMcpUnregisterToolPractice, deepmindMcpUnregisterToolPractice] as const;
export const mcpUnregisterToolBestPracticeDescriptor = { toolId: "mcp.unregisterTool", bestPractice: "storage-owned-mcp-unregister-tool-with-runtime-owned-client", providerOrder: ["anthropic", "openai", "deepmind"], dependencies: mcpUnregisterToolDependencyDeclarations } as const;

function orderedPractices(preferredProvider: McpUnregisterToolPracticeProviderName | undefined): readonly McpUnregisterToolProviderPractice[] {
  if (preferredProvider === undefined) return mcpUnregisterToolProviderPractices;
  return [...mcpUnregisterToolProviderPractices.filter((practice) => practice.providerName === preferredProvider), ...mcpUnregisterToolProviderPractices.filter((practice) => practice.providerName !== preferredProvider)];
}

export function selectMcpUnregisterToolPractice(dependencies: McpUnregisterToolDependencies & { preferredProvider?: McpUnregisterToolPracticeProviderName } = {}): McpUnregisterToolPracticeSelection {
  for (const practice of orderedPractices(dependencies.preferredProvider)) {
    const provider = practice.createProvider(dependencies);
    if (provider !== undefined) return { providerName: practice.providerName, practice, provider };
  }
  return { providerName: "praxis-native", practice: { providerName: "praxis-native", source: { kind: "praxis-native", label: "Praxis dry-run fallback" }, directCliSupport: false, sideEffectPolicy: "runtime-owned-client", notes: ["No runtime MCP unregisterTool provider is available; dry-run remains available."], createProvider: () => undefined } };
}

function practiceAuditMetadata(selection: McpUnregisterToolPracticeSelection): Readonly<Record<string, unknown>> {
  return buildMcpPracticeAuditMetadata({ providerName: selection.providerName, sourceLabel: selection.practice.source.label, sourceKind: selection.practice.source.kind, sourcePath: selection.practice.source.path, directCliSupport: selection.practice.directCliSupport, sideEffectPolicy: selection.practice.sideEffectPolicy, notes: selection.practice.notes });
}

export async function executeMcpToolUnregistration(request: McpUnregisterToolBestPracticeRequest | unknown = {}, providerOverride?: UnregisterMcpToolProvider): Promise<UnregisterMcpToolResult> {
  const requestRecord = isJsonObject(request) ? (request as McpUnregisterToolBestPracticeRequest) : {};
  const selection = selectMcpUnregisterToolPractice({ executor: requestRecord.executor, provider: providerOverride ?? requestRecord.provider, preferredProvider: requestRecord.preferredProvider });
  const context = isJsonObject(requestRecord.context) ? requestRecord.context : undefined;
  return executeMcpToolUnregistrationCore(isJsonObject(request) ? { ...requestRecord, context: { ...context, auditMetadata: { ...(context?.auditMetadata ?? {}), ...practiceAuditMetadata(selection) } } } : request, selection.provider);
}

export const mcpUnregisterToolBaseToolDefinition = createMcpBaseToolDefinition<McpUnregisterToolHandlerInput, UnregisterMcpToolOutput>({
  toolId: "mcp.unregisterTool",
  title: "MCP Unregister Tool",
  description: "Request runtime to unregister an MCP tool definition.",
  summary: "Use mcp.unregisterTool for governed runtime-owned MCP tool registry removal.",
  storageGroup: "tool",
  riskLevel: "risky",
  permissionHints: ["mcp:access", "mcp:tool:read", "mcp:tool:write"],
  dependencies: mcpUnregisterToolDependencyDeclarations,
  inputSchema: jsonSchema("mcp.unregisterTool.input", { type: "object", additionalProperties: true }),
  outputSchema: jsonSchema("mcp.unregisterTool.output", { type: "object", additionalProperties: true }),
});

export const mcpUnregisterToolHandler: BaseToolHandler<McpUnregisterToolHandlerInput, UnregisterMcpToolOutput> = createMcpCoreHandler(
  mcpUnregisterToolBaseToolDefinition,
  async (request) => {
    const selection = selectMcpUnregisterToolPractice({ executor: request.executor, provider: request.input.provider, preferredProvider: request.input.preferredProvider });
    const inputContext = request.input.context ?? {};
    const context: McpToolRegistryContext = { ...inputContext, runtimeId: inputContext.runtimeId ?? request.runtimeId, sessionId: inputContext.sessionId ?? request.sessionId, invocationId: inputContext.invocationId ?? request.toolCallId, auditMetadata: injectRuntimeInvocationMetadata({ ...practiceAuditMetadata(selection), ...(request.metadata ?? {}) }, inputContext.auditMetadata, request) };
    return executeMcpToolUnregistrationCore({ ...request.input, context }, selection.provider);
  },
);

export type { UnregisterMcpToolResult };
export { planMcpToolUnregistration };
