import type { BaseToolExecutorPort } from "../../../../../agentCore/agent_executionEngine/basic_toolLayer/baseTools/baseToolExecutorPort.js";
import type { BaseToolHandler } from "../../../../../agentCore/agent_executionEngine/basic_toolLayer/baseTools/baseToolDefinition.js";
import { buildMcpPracticeAuditMetadata, createMcpBaseToolDefinition, createMcpCoreHandler, injectRuntimeInvocationMetadata, isJsonObject, jsonSchema } from "../../_shared/baseToolAdapter.js";
import { anthropicMcpUpdateResourcePractice } from "./anthropic.js";
import { deepmindMcpUpdateResourcePractice } from "./deepmind.js";
import { mcpUpdateResourceDependencyDeclarations, type McpUpdateResourceDependencies, type McpUpdateResourcePracticeProviderName, type McpUpdateResourceProviderPractice } from "./dependencies.js";
import { openaiMcpUpdateResourcePractice } from "./openai.js";
import { executeMcpResourceUpdate as executeMcpResourceUpdateCore, mcpUpdateResourceDescriptor, planMcpResourceUpdate, type McpUpdateResourceContext, type McpUpdateResourceOutput, type McpUpdateResourceProvider, type McpUpdateResourceRequest, type McpUpdateResourceResult } from "./core.js";

export * from "./core.js";

export type McpUpdateResourceBestPracticeRequest = McpUpdateResourceRequest & { executor?: BaseToolExecutorPort; provider?: McpUpdateResourceProvider; preferredProvider?: McpUpdateResourcePracticeProviderName };
export type McpUpdateResourceHandlerInput = Omit<McpUpdateResourceBestPracticeRequest, "executor">;
export type McpUpdateResourcePracticeSelection = { providerName: McpUpdateResourcePracticeProviderName; practice: McpUpdateResourceProviderPractice; provider?: McpUpdateResourceProvider };
export const mcpUpdateResourceProviderPractices = [anthropicMcpUpdateResourcePractice, openaiMcpUpdateResourcePractice, deepmindMcpUpdateResourcePractice] as const;
export const mcpUpdateResourceBestPracticeDescriptor = { toolId: "mcp.updateResource", bestPractice: "storage-owned-mcp-update-resource-with-runtime-owned-client", providerOrder: ["anthropic", "openai", "deepmind"], dependencies: mcpUpdateResourceDependencyDeclarations } as const;

function orderedPractices(preferredProvider: McpUpdateResourcePracticeProviderName | undefined): readonly McpUpdateResourceProviderPractice[] {
  if (preferredProvider === undefined) return mcpUpdateResourceProviderPractices;
  return [...mcpUpdateResourceProviderPractices.filter((practice) => practice.providerName === preferredProvider), ...mcpUpdateResourceProviderPractices.filter((practice) => practice.providerName !== preferredProvider)];
}

export function selectMcpUpdateResourcePractice(dependencies: McpUpdateResourceDependencies & { preferredProvider?: McpUpdateResourcePracticeProviderName } = {}): McpUpdateResourcePracticeSelection {
  for (const practice of orderedPractices(dependencies.preferredProvider)) {
    const provider = practice.createProvider(dependencies);
    if (provider !== undefined) return { providerName: practice.providerName, practice, provider };
  }
  return { providerName: "praxis-native", practice: { providerName: "praxis-native", source: { kind: "praxis-native", label: "Praxis dry-run fallback" }, directCliSupport: false, sideEffectPolicy: "runtime-owned-client", notes: ["No runtime MCP updateResource provider is available; dry-run remains available."], createProvider: () => undefined } };
}

function practiceAuditMetadata(selection: McpUpdateResourcePracticeSelection): Readonly<Record<string, unknown>> {
  return buildMcpPracticeAuditMetadata({ providerName: selection.providerName, sourceLabel: selection.practice.source.label, sourceKind: selection.practice.source.kind, sourcePath: selection.practice.source.path, directCliSupport: selection.practice.directCliSupport, sideEffectPolicy: selection.practice.sideEffectPolicy, notes: selection.practice.notes });
}

export async function executeMcpResourceUpdate(request: McpUpdateResourceBestPracticeRequest | unknown = {}): Promise<McpUpdateResourceResult> {
  const requestRecord = isJsonObject(request) ? (request as McpUpdateResourceBestPracticeRequest) : {};
  const selection = selectMcpUpdateResourcePractice({ executor: requestRecord.executor, provider: requestRecord.provider, preferredProvider: requestRecord.preferredProvider });
  const context = isJsonObject(requestRecord.context) ? requestRecord.context : undefined;
  return executeMcpResourceUpdateCore(isJsonObject(request) ? { ...requestRecord, context: { ...context, auditMetadata: { ...(context?.auditMetadata ?? {}), ...practiceAuditMetadata(selection) } } } : request, selection.provider);
}

export const mcpUpdateResourceBaseToolDefinition = createMcpBaseToolDefinition<McpUpdateResourceHandlerInput, McpUpdateResourceOutput>({
  toolId: "mcp.updateResource",
  title: "MCP Update Resource",
  description: "Request runtime to update a resource on a configured MCP server.",
  summary: "Use mcp.updateResource for governed runtime-owned MCP resource mutation.",
  storageGroup: "resource",
  riskLevel: "risky",
  permissionHints: ["mcp:access", "mcp:resource:write"],
  dependencies: mcpUpdateResourceDependencyDeclarations,
  inputSchema: jsonSchema("mcp.updateResource.input", { type: "object", additionalProperties: true }),
  outputSchema: jsonSchema("mcp.updateResource.output", { type: "object", additionalProperties: true }),
});

export const mcpUpdateResourceHandler: BaseToolHandler<McpUpdateResourceHandlerInput, McpUpdateResourceOutput> = createMcpCoreHandler(
  mcpUpdateResourceBaseToolDefinition,
  async (request) => {
    const selection = selectMcpUpdateResourcePractice({ executor: request.executor, provider: request.input.provider, preferredProvider: request.input.preferredProvider });
    const inputContext = request.input.context ?? {};
    const context: McpUpdateResourceContext = { ...inputContext, runtimeId: inputContext.runtimeId ?? request.runtimeId, sessionId: inputContext.sessionId ?? request.sessionId, invocationId: inputContext.invocationId ?? request.toolCallId, auditMetadata: injectRuntimeInvocationMetadata({ ...practiceAuditMetadata(selection), ...(request.metadata ?? {}) }, inputContext.auditMetadata, request) };
    return executeMcpResourceUpdateCore({ ...request.input, context }, selection.provider);
  },
);

export type { McpUpdateResourceResult };
export { mcpUpdateResourceDescriptor, planMcpResourceUpdate };
