import type { BaseToolExecutorPort } from "../../../../../agentCore_executionEngine/basic_toolLayer/baseTools/baseToolExecutorPort.js";
import type { BaseToolHandler } from "../../../../../agentCore_executionEngine/basic_toolLayer/baseTools/baseToolDefinition.js";
import { buildMcpPracticeAuditMetadata, createMcpBaseToolDefinition, createMcpCoreHandler, injectRuntimeInvocationMetadata, isJsonObject, jsonSchema } from "../../_shared/baseToolAdapter.js";
import { anthropicMcpDeleteResourcePractice } from "./anthropic.js";
import { deepmindMcpDeleteResourcePractice } from "./deepmind.js";
import { mcpDeleteResourceDependencyDeclarations, type McpDeleteResourceDependencies, type McpDeleteResourcePracticeProviderName, type McpDeleteResourceProviderPractice } from "./dependencies.js";
import { openaiMcpDeleteResourcePractice } from "./openai.js";
import { executeMcpDeleteResource as executeMcpDeleteResourceCore, mcpDeleteResourceDescriptor, planMcpDeleteResource, type McpDeleteResourceContext, type McpDeleteResourceOutput, type McpDeleteResourceProvider, type McpDeleteResourceRequest, type McpDeleteResourceResult } from "./core.js";

export * from "./core.js";

export type McpDeleteResourceBestPracticeRequest = McpDeleteResourceRequest & { executor?: BaseToolExecutorPort; provider?: McpDeleteResourceProvider; preferredProvider?: McpDeleteResourcePracticeProviderName };
export type McpDeleteResourceHandlerInput = Omit<McpDeleteResourceBestPracticeRequest, "executor">;
export type McpDeleteResourcePracticeSelection = { providerName: McpDeleteResourcePracticeProviderName; practice: McpDeleteResourceProviderPractice; provider?: McpDeleteResourceProvider };
export const mcpDeleteResourceProviderPractices = [anthropicMcpDeleteResourcePractice, openaiMcpDeleteResourcePractice, deepmindMcpDeleteResourcePractice] as const;
export const mcpDeleteResourceBestPracticeDescriptor = { toolId: "mcp.deleteResource", bestPractice: "storage-owned-mcp-delete-resource-with-runtime-owned-client", providerOrder: ["anthropic", "openai", "deepmind"], dependencies: mcpDeleteResourceDependencyDeclarations } as const;

function orderedPractices(preferredProvider: McpDeleteResourcePracticeProviderName | undefined): readonly McpDeleteResourceProviderPractice[] {
  if (preferredProvider === undefined) return mcpDeleteResourceProviderPractices;
  return [...mcpDeleteResourceProviderPractices.filter((practice) => practice.providerName === preferredProvider), ...mcpDeleteResourceProviderPractices.filter((practice) => practice.providerName !== preferredProvider)];
}

export function selectMcpDeleteResourcePractice(dependencies: McpDeleteResourceDependencies & { preferredProvider?: McpDeleteResourcePracticeProviderName } = {}): McpDeleteResourcePracticeSelection {
  for (const practice of orderedPractices(dependencies.preferredProvider)) {
    const provider = practice.createProvider(dependencies);
    if (provider !== undefined) return { providerName: practice.providerName, practice, provider };
  }
  return { providerName: "praxis-native", practice: { providerName: "praxis-native", source: { kind: "praxis-native", label: "Praxis dry-run fallback" }, directCliSupport: false, sideEffectPolicy: "runtime-owned-client", notes: ["No runtime MCP deleteResource provider is available; dry-run remains available."], createProvider: () => undefined } };
}

function practiceAuditMetadata(selection: McpDeleteResourcePracticeSelection): Readonly<Record<string, unknown>> {
  return buildMcpPracticeAuditMetadata({ providerName: selection.providerName, sourceLabel: selection.practice.source.label, sourceKind: selection.practice.source.kind, sourcePath: selection.practice.source.path, directCliSupport: selection.practice.directCliSupport, sideEffectPolicy: selection.practice.sideEffectPolicy, notes: selection.practice.notes });
}

export async function executeMcpDeleteResource(request: McpDeleteResourceBestPracticeRequest | unknown = {}): Promise<McpDeleteResourceResult> {
  const requestRecord = isJsonObject(request) ? (request as McpDeleteResourceBestPracticeRequest) : {};
  const selection = selectMcpDeleteResourcePractice({ executor: requestRecord.executor, provider: requestRecord.provider, preferredProvider: requestRecord.preferredProvider });
  const context = isJsonObject(requestRecord.context) ? requestRecord.context : undefined;
  return executeMcpDeleteResourceCore(isJsonObject(request) ? { ...requestRecord, context: { ...context, auditMetadata: { ...(context?.auditMetadata ?? {}), ...practiceAuditMetadata(selection) } } } : request, selection.provider);
}

export const mcpDeleteResourceBaseToolDefinition = createMcpBaseToolDefinition<McpDeleteResourceHandlerInput, McpDeleteResourceOutput>({
  toolId: "mcp.deleteResource",
  title: "MCP Delete Resource",
  description: "Request runtime to delete a resource on a configured MCP server.",
  summary: "Use mcp.deleteResource for governed runtime-owned MCP resource deletion.",
  storageGroup: "resource",
  riskLevel: "dangerous",
  permissionHints: ["mcp:access", "mcp:connection:read", "mcp:resource:delete"],
  dependencies: mcpDeleteResourceDependencyDeclarations,
  inputSchema: jsonSchema("mcp.deleteResource.input", { type: "object", additionalProperties: true }),
  outputSchema: jsonSchema("mcp.deleteResource.output", { type: "object", additionalProperties: true }),
});

export const mcpDeleteResourceHandler: BaseToolHandler<McpDeleteResourceHandlerInput, McpDeleteResourceOutput> = createMcpCoreHandler(
  mcpDeleteResourceBaseToolDefinition,
  async (request) => {
    const selection = selectMcpDeleteResourcePractice({ executor: request.executor, provider: request.input.provider, preferredProvider: request.input.preferredProvider });
    const inputContext = request.input.context ?? {};
    const context: McpDeleteResourceContext = { ...inputContext, runtimeId: inputContext.runtimeId ?? request.runtimeId, sessionId: inputContext.sessionId ?? request.sessionId, invocationId: inputContext.invocationId ?? request.toolCallId, auditMetadata: injectRuntimeInvocationMetadata({ ...practiceAuditMetadata(selection), ...(request.metadata ?? {}) }, inputContext.auditMetadata, request) };
    return executeMcpDeleteResourceCore({ ...request.input, context }, selection.provider);
  },
);

export type { McpDeleteResourceResult };
export { mcpDeleteResourceDescriptor, planMcpDeleteResource };
