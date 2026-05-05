import type { BaseToolExecutorPort } from "../../../../../agentCore/agent_executionEngine/basic_toolLayer/baseTools/baseToolExecutorPort.js";
import type { BaseToolHandler } from "../../../../../agentCore/agent_executionEngine/basic_toolLayer/baseTools/baseToolDefinition.js";
import { buildMcpPracticeAuditMetadata, createMcpBaseToolDefinition, createMcpCoreHandler, injectRuntimeInvocationMetadata, isJsonObject, jsonSchema } from "../../_shared/baseToolAdapter.js";
import { anthropicMcpUpdateToolPractice } from "./anthropic.js";
import { deepmindMcpUpdateToolPractice } from "./deepmind.js";
import { mcpUpdateToolDependencyDeclarations, type McpUpdateToolDependencies, type McpUpdateToolPracticeProviderName, type McpUpdateToolProviderPractice } from "./dependencies.js";
import { openaiMcpUpdateToolPractice } from "./openai.js";
import type { McpToolRegistryContext } from "../mcp.registerTool/core.js";
import { executeMcpToolUpdate as executeMcpToolUpdateCore, planMcpToolUpdate, type UpdateMcpToolOutput, type UpdateMcpToolProvider, type UpdateMcpToolRequest, type UpdateMcpToolResult } from "./core.js";

export * from "./core.js";

export type McpUpdateToolBestPracticeRequest = UpdateMcpToolRequest & { executor?: BaseToolExecutorPort; provider?: UpdateMcpToolProvider; preferredProvider?: McpUpdateToolPracticeProviderName };
export type McpUpdateToolHandlerInput = Omit<McpUpdateToolBestPracticeRequest, "executor">;
export type McpUpdateToolPracticeSelection = { providerName: McpUpdateToolPracticeProviderName; practice: McpUpdateToolProviderPractice; provider?: UpdateMcpToolProvider };
export const mcpUpdateToolProviderPractices = [anthropicMcpUpdateToolPractice, openaiMcpUpdateToolPractice, deepmindMcpUpdateToolPractice] as const;
export const mcpUpdateToolBestPracticeDescriptor = { toolId: "mcp.updateTool", bestPractice: "storage-owned-mcp-update-tool-with-runtime-owned-client", providerOrder: ["anthropic", "openai", "deepmind"], dependencies: mcpUpdateToolDependencyDeclarations } as const;

function orderedPractices(preferredProvider: McpUpdateToolPracticeProviderName | undefined): readonly McpUpdateToolProviderPractice[] {
  if (preferredProvider === undefined) return mcpUpdateToolProviderPractices;
  return [...mcpUpdateToolProviderPractices.filter((practice) => practice.providerName === preferredProvider), ...mcpUpdateToolProviderPractices.filter((practice) => practice.providerName !== preferredProvider)];
}

export function selectMcpUpdateToolPractice(dependencies: McpUpdateToolDependencies & { preferredProvider?: McpUpdateToolPracticeProviderName } = {}): McpUpdateToolPracticeSelection {
  for (const practice of orderedPractices(dependencies.preferredProvider)) {
    const provider = practice.createProvider(dependencies);
    if (provider !== undefined) return { providerName: practice.providerName, practice, provider };
  }
  return { providerName: "praxis-native", practice: { providerName: "praxis-native", source: { kind: "praxis-native", label: "Praxis dry-run fallback" }, directCliSupport: false, sideEffectPolicy: "runtime-owned-client", notes: ["No runtime MCP updateTool provider is available; dry-run remains available."], createProvider: () => undefined } };
}

function practiceAuditMetadata(selection: McpUpdateToolPracticeSelection): Readonly<Record<string, unknown>> {
  return buildMcpPracticeAuditMetadata({ providerName: selection.providerName, sourceLabel: selection.practice.source.label, sourceKind: selection.practice.source.kind, sourcePath: selection.practice.source.path, directCliSupport: selection.practice.directCliSupport, sideEffectPolicy: selection.practice.sideEffectPolicy, notes: selection.practice.notes });
}

export async function executeMcpToolUpdate(request: McpUpdateToolBestPracticeRequest | unknown = {}, providerOverride?: UpdateMcpToolProvider): Promise<UpdateMcpToolResult> {
  const requestRecord = isJsonObject(request) ? (request as McpUpdateToolBestPracticeRequest) : {};
  const selection = selectMcpUpdateToolPractice({ executor: requestRecord.executor, provider: providerOverride ?? requestRecord.provider, preferredProvider: requestRecord.preferredProvider });
  const context = isJsonObject(requestRecord.context) ? requestRecord.context : undefined;
  return executeMcpToolUpdateCore(isJsonObject(request) ? { ...requestRecord, context: { ...context, auditMetadata: { ...(context?.auditMetadata ?? {}), ...practiceAuditMetadata(selection) } } } : request, selection.provider);
}

export const mcpUpdateToolBaseToolDefinition = createMcpBaseToolDefinition<McpUpdateToolHandlerInput, UpdateMcpToolOutput>({
  toolId: "mcp.updateTool",
  title: "MCP Update Tool",
  description: "Request runtime to update a registered MCP tool definition.",
  summary: "Use mcp.updateTool for governed runtime-owned MCP tool registry patching.",
  storageGroup: "tool",
  riskLevel: "risky",
  permissionHints: ["mcp:access", "mcp:tool:read", "mcp:tool:write"],
  dependencies: mcpUpdateToolDependencyDeclarations,
  inputSchema: jsonSchema("mcp.updateTool.input", { type: "object", additionalProperties: true }),
  outputSchema: jsonSchema("mcp.updateTool.output", { type: "object", additionalProperties: true }),
});

export const mcpUpdateToolHandler: BaseToolHandler<McpUpdateToolHandlerInput, UpdateMcpToolOutput> = createMcpCoreHandler(
  mcpUpdateToolBaseToolDefinition,
  async (request) => {
    const selection = selectMcpUpdateToolPractice({ executor: request.executor, provider: request.input.provider, preferredProvider: request.input.preferredProvider });
    const inputContext = request.input.context ?? {};
    const context: McpToolRegistryContext = { ...inputContext, runtimeId: inputContext.runtimeId ?? request.runtimeId, sessionId: inputContext.sessionId ?? request.sessionId, invocationId: inputContext.invocationId ?? request.toolCallId, auditMetadata: injectRuntimeInvocationMetadata({ ...practiceAuditMetadata(selection), ...(request.metadata ?? {}) }, inputContext.auditMetadata, request) };
    return executeMcpToolUpdateCore({ ...request.input, context }, selection.provider);
  },
);

export type { UpdateMcpToolResult };
export { planMcpToolUpdate };
