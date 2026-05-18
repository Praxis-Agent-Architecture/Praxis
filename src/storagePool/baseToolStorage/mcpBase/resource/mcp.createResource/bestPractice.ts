import type { BaseToolExecutorPort } from "../../../../../agentCore/agent_executionEngine/basic_toolLayer/baseTools/baseToolExecutorPort.js";
import type { BaseToolHandler } from "../../../../../agentCore/agent_executionEngine/basic_toolLayer/baseTools/baseToolDefinition.js";
import { buildMcpPracticeAuditMetadata, createMcpBaseToolDefinition, createMcpCoreHandler, injectRuntimeInvocationMetadata, isJsonObject, jsonSchema } from "../../_shared/baseToolAdapter.js";
import { anthropicMcpCreateResourcePractice } from "./anthropic.js";
import { deepmindMcpCreateResourcePractice } from "./deepmind.js";
import { mcpCreateResourceDependencyDeclarations, type McpCreateResourceDependencies, type McpCreateResourcePracticeProviderName, type McpCreateResourceProviderPractice } from "./dependencies.js";
import { openaiMcpCreateResourcePractice } from "./openai.js";
import { executeMcpCreateResource as executeMcpCreateResourceCore, mcpCreateResourceDescriptor, planMcpCreateResource, type McpCreateResourceContext, type McpCreateResourceOutput, type McpCreateResourceProvider, type McpCreateResourceRequest, type McpCreateResourceResult } from "./core.js";

export * from "./core.js";

export type McpCreateResourceBestPracticeRequest = McpCreateResourceRequest & { executor?: BaseToolExecutorPort; provider?: McpCreateResourceProvider; preferredProvider?: McpCreateResourcePracticeProviderName };
export type McpCreateResourceHandlerInput = Omit<McpCreateResourceBestPracticeRequest, "executor">;
export type McpCreateResourcePracticeSelection = { providerName: McpCreateResourcePracticeProviderName; practice: McpCreateResourceProviderPractice; provider?: McpCreateResourceProvider };
export const mcpCreateResourceProviderPractices = [anthropicMcpCreateResourcePractice, openaiMcpCreateResourcePractice, deepmindMcpCreateResourcePractice] as const;
export const mcpCreateResourceBestPracticeDescriptor = { toolId: "mcp.createResource", bestPractice: "storage-owned-mcp-create-resource-with-runtime-owned-client", providerOrder: ["anthropic", "openai", "deepmind"], dependencies: mcpCreateResourceDependencyDeclarations } as const;

function orderedPractices(preferredProvider: McpCreateResourcePracticeProviderName | undefined): readonly McpCreateResourceProviderPractice[] {
  if (preferredProvider === undefined) return mcpCreateResourceProviderPractices;
  return [...mcpCreateResourceProviderPractices.filter((practice) => practice.providerName === preferredProvider), ...mcpCreateResourceProviderPractices.filter((practice) => practice.providerName !== preferredProvider)];
}

export function selectMcpCreateResourcePractice(dependencies: McpCreateResourceDependencies & { preferredProvider?: McpCreateResourcePracticeProviderName } = {}): McpCreateResourcePracticeSelection {
  for (const practice of orderedPractices(dependencies.preferredProvider)) {
    const provider = practice.createProvider(dependencies);
    if (provider !== undefined) return { providerName: practice.providerName, practice, provider };
  }
  return { providerName: "praxis-native", practice: { providerName: "praxis-native", source: { kind: "praxis-native", label: "Praxis dry-run fallback" }, directCliSupport: false, sideEffectPolicy: "runtime-owned-client", notes: ["No runtime MCP createResource provider is available; dry-run remains available."], createProvider: () => undefined } };
}

function practiceAuditMetadata(selection: McpCreateResourcePracticeSelection): Readonly<Record<string, unknown>> {
  return buildMcpPracticeAuditMetadata({ providerName: selection.providerName, sourceLabel: selection.practice.source.label, sourceKind: selection.practice.source.kind, sourcePath: selection.practice.source.path, directCliSupport: selection.practice.directCliSupport, sideEffectPolicy: selection.practice.sideEffectPolicy, notes: selection.practice.notes });
}

export async function executeMcpCreateResource(request: McpCreateResourceBestPracticeRequest | unknown = {}): Promise<McpCreateResourceResult> {
  const requestRecord = isJsonObject(request) ? (request as McpCreateResourceBestPracticeRequest) : {};
  const selection = selectMcpCreateResourcePractice({ executor: requestRecord.executor, provider: requestRecord.provider, preferredProvider: requestRecord.preferredProvider });
  const context = isJsonObject(requestRecord.context) ? requestRecord.context : undefined;
  return executeMcpCreateResourceCore(isJsonObject(request) ? { ...requestRecord, context: { ...context, auditMetadata: { ...(context?.auditMetadata ?? {}), ...practiceAuditMetadata(selection) } } } : request, selection.provider);
}

export const mcpCreateResourceBaseToolDefinition = createMcpBaseToolDefinition<McpCreateResourceHandlerInput, McpCreateResourceOutput>({
  toolId: "mcp.createResource",
  title: "MCP Create Resource",
  description: "Request runtime to create a resource on a configured MCP server.",
  summary: "Use mcp.createResource for governed runtime-owned MCP resource creation.",
  storageGroup: "resource",
  riskLevel: "risky",
  permissionHints: ["mcp:access", "mcp:connection:read", "mcp:resource:create"],
  dependencies: mcpCreateResourceDependencyDeclarations,
  inputSchema: jsonSchema("mcp.createResource.input", { type: "object", additionalProperties: true }),
  outputSchema: jsonSchema("mcp.createResource.output", { type: "object", additionalProperties: true }),
});

export const mcpCreateResourceHandler: BaseToolHandler<McpCreateResourceHandlerInput, McpCreateResourceOutput> = createMcpCoreHandler(
  mcpCreateResourceBaseToolDefinition,
  async (request) => {
    const selection = selectMcpCreateResourcePractice({ executor: request.executor, provider: request.input.provider, preferredProvider: request.input.preferredProvider });
    const inputContext = request.input.context ?? {};
    const context: McpCreateResourceContext = { ...inputContext, runtimeId: inputContext.runtimeId ?? request.runtimeId, sessionId: inputContext.sessionId ?? request.sessionId, invocationId: inputContext.invocationId ?? request.toolCallId, auditMetadata: injectRuntimeInvocationMetadata({ ...practiceAuditMetadata(selection), ...(request.metadata ?? {}) }, inputContext.auditMetadata, request) };
    return executeMcpCreateResourceCore({ ...request.input, context }, selection.provider);
  },
);

export type { McpCreateResourceResult };
export { mcpCreateResourceDescriptor, planMcpCreateResource };
