import type { BaseToolExecutorPort } from "../../../../../agentCore/agent_executionEngine/basic_toolLayer/baseTools/baseToolExecutorPort.js";
import type { BaseToolHandler } from "../../../../../agentCore/agent_executionEngine/basic_toolLayer/baseTools/baseToolDefinition.js";
import { buildMcpPracticeAuditMetadata, createMcpBaseToolDefinition, createMcpCoreHandler, injectRuntimeInvocationMetadata, isJsonObject, jsonSchema } from "../../_shared/baseToolAdapter.js";
import { anthropicMcpRegisterToolPractice } from "./anthropic.js";
import { deepmindMcpRegisterToolPractice } from "./deepmind.js";
import { mcpRegisterToolDependencyDeclarations, type McpRegisterToolDependencies, type McpRegisterToolPracticeProviderName, type McpRegisterToolProviderPractice } from "./dependencies.js";
import { openaiMcpRegisterToolPractice } from "./openai.js";
import { executeMcpToolRegistration as executeMcpToolRegistrationCore, planMcpToolRegistration, type McpToolRegistryContext, type RegisterMcpToolOutput, type RegisterMcpToolProvider, type RegisterMcpToolRequest, type RegisterMcpToolResult } from "./core.js";

export * from "./core.js";

export type McpRegisterToolBestPracticeRequest = RegisterMcpToolRequest & { executor?: BaseToolExecutorPort; provider?: RegisterMcpToolProvider; preferredProvider?: McpRegisterToolPracticeProviderName };
export type McpRegisterToolHandlerInput = Omit<McpRegisterToolBestPracticeRequest, "executor">;
export type McpRegisterToolPracticeSelection = { providerName: McpRegisterToolPracticeProviderName; practice: McpRegisterToolProviderPractice; provider?: RegisterMcpToolProvider };
export const mcpRegisterToolProviderPractices = [anthropicMcpRegisterToolPractice, openaiMcpRegisterToolPractice, deepmindMcpRegisterToolPractice] as const;
export const mcpRegisterToolBestPracticeDescriptor = { toolId: "mcp.registerTool", bestPractice: "storage-owned-mcp-register-tool-with-runtime-owned-client", providerOrder: ["anthropic", "openai", "deepmind"], dependencies: mcpRegisterToolDependencyDeclarations } as const;

function orderedPractices(preferredProvider: McpRegisterToolPracticeProviderName | undefined): readonly McpRegisterToolProviderPractice[] {
  if (preferredProvider === undefined) return mcpRegisterToolProviderPractices;
  return [...mcpRegisterToolProviderPractices.filter((practice) => practice.providerName === preferredProvider), ...mcpRegisterToolProviderPractices.filter((practice) => practice.providerName !== preferredProvider)];
}

export function selectMcpRegisterToolPractice(dependencies: McpRegisterToolDependencies & { preferredProvider?: McpRegisterToolPracticeProviderName } = {}): McpRegisterToolPracticeSelection {
  for (const practice of orderedPractices(dependencies.preferredProvider)) {
    const provider = practice.createProvider(dependencies);
    if (provider !== undefined) return { providerName: practice.providerName, practice, provider };
  }
  return { providerName: "praxis-native", practice: { providerName: "praxis-native", source: { kind: "praxis-native", label: "Praxis dry-run fallback" }, directCliSupport: false, sideEffectPolicy: "runtime-owned-client", notes: ["No runtime MCP registerTool provider is available; dry-run remains available."], createProvider: () => undefined } };
}

function practiceAuditMetadata(selection: McpRegisterToolPracticeSelection): Readonly<Record<string, unknown>> {
  return buildMcpPracticeAuditMetadata({ providerName: selection.providerName, sourceLabel: selection.practice.source.label, sourceKind: selection.practice.source.kind, sourcePath: selection.practice.source.path, directCliSupport: selection.practice.directCliSupport, sideEffectPolicy: selection.practice.sideEffectPolicy, notes: selection.practice.notes });
}

export async function executeMcpToolRegistration(request: McpRegisterToolBestPracticeRequest | unknown = {}, providerOverride?: RegisterMcpToolProvider): Promise<RegisterMcpToolResult> {
  const requestRecord = isJsonObject(request) ? (request as McpRegisterToolBestPracticeRequest) : {};
  const selection = selectMcpRegisterToolPractice({ executor: requestRecord.executor, provider: providerOverride ?? requestRecord.provider, preferredProvider: requestRecord.preferredProvider });
  const context = isJsonObject(requestRecord.context) ? requestRecord.context : undefined;
  return executeMcpToolRegistrationCore(isJsonObject(request) ? { ...requestRecord, context: { ...context, auditMetadata: { ...(context?.auditMetadata ?? {}), ...practiceAuditMetadata(selection) } } } : request, selection.provider);
}

export const mcpRegisterToolBaseToolDefinition = createMcpBaseToolDefinition<McpRegisterToolHandlerInput, RegisterMcpToolOutput>({
  toolId: "mcp.registerTool",
  title: "MCP Register Tool",
  description: "Request runtime to register a tool on a configured MCP server.",
  summary: "Use mcp.registerTool for governed runtime-owned MCP tool registry mutation.",
  storageGroup: "tool",
  riskLevel: "risky",
  permissionHints: ["mcp:access", "mcp:tool:read", "mcp:tool:write"],
  dependencies: mcpRegisterToolDependencyDeclarations,
  inputSchema: jsonSchema("mcp.registerTool.input", { type: "object", additionalProperties: true }),
  outputSchema: jsonSchema("mcp.registerTool.output", { type: "object", additionalProperties: true }),
});

export const mcpRegisterToolHandler: BaseToolHandler<McpRegisterToolHandlerInput, RegisterMcpToolOutput> = createMcpCoreHandler(
  mcpRegisterToolBaseToolDefinition,
  async (request) => {
    const selection = selectMcpRegisterToolPractice({ executor: request.executor, provider: request.input.provider, preferredProvider: request.input.preferredProvider });
    const inputContext = request.input.context ?? {};
    const context: McpToolRegistryContext = { ...inputContext, runtimeId: inputContext.runtimeId ?? request.runtimeId, sessionId: inputContext.sessionId ?? request.sessionId, invocationId: inputContext.invocationId ?? request.toolCallId, auditMetadata: injectRuntimeInvocationMetadata({ ...practiceAuditMetadata(selection), ...(request.metadata ?? {}) }, inputContext.auditMetadata, request) };
    return executeMcpToolRegistrationCore({ ...request.input, context }, selection.provider);
  },
);

export type { RegisterMcpToolResult };
export { planMcpToolRegistration };
