import type { BaseToolExecutorPort } from "../../../../../agentCore_executionEngine/basic_toolLayer/baseTools/baseToolExecutorPort.js";
import type { BaseToolHandler } from "../../../../../agentCore_executionEngine/basic_toolLayer/baseTools/baseToolDefinition.js";
import { buildMcpPracticeAuditMetadata, createMcpBaseToolDefinition, createMcpCoreHandler, injectRuntimeInvocationMetadata, isJsonObject, jsonSchema } from "../../_shared/baseToolAdapter.js";
import { anthropicMcpReadResourcePractice } from "./anthropic.js";
import { deepmindMcpReadResourcePractice } from "./deepmind.js";
import { mcpReadResourceDependencyDeclarations, type McpReadResourceDependencies, type McpReadResourcePracticeProviderName, type McpReadResourceProviderPractice } from "./dependencies.js";
import { openaiMcpReadResourcePractice } from "./openai.js";
import { executeMcpResourceRead as executeMcpResourceReadCore, mcpReadResourceDescriptor, planMcpResourceRead, type McpReadResourceContext, type McpReadResourceOutput, type McpReadResourceProvider, type McpReadResourceRequest, type McpReadResourceResult } from "./core.js";

export * from "./core.js";

export type McpReadResourceBestPracticeRequest = McpReadResourceRequest & { executor?: BaseToolExecutorPort; provider?: McpReadResourceProvider; preferredProvider?: McpReadResourcePracticeProviderName };
export type McpReadResourceHandlerInput = Omit<McpReadResourceBestPracticeRequest, "executor">;
export type McpReadResourcePracticeSelection = { providerName: McpReadResourcePracticeProviderName; practice: McpReadResourceProviderPractice; provider?: McpReadResourceProvider };
export const mcpReadResourceProviderPractices = [anthropicMcpReadResourcePractice, openaiMcpReadResourcePractice, deepmindMcpReadResourcePractice] as const;
export const mcpReadResourceBestPracticeDescriptor = { toolId: "mcp.readResource", bestPractice: "storage-owned-mcp-read-resource-with-runtime-owned-client", providerOrder: ["anthropic", "openai", "deepmind"], dependencies: mcpReadResourceDependencyDeclarations } as const;

function orderedPractices(preferredProvider: McpReadResourcePracticeProviderName | undefined): readonly McpReadResourceProviderPractice[] {
  if (preferredProvider === undefined) return mcpReadResourceProviderPractices;
  return [...mcpReadResourceProviderPractices.filter((practice) => practice.providerName === preferredProvider), ...mcpReadResourceProviderPractices.filter((practice) => practice.providerName !== preferredProvider)];
}

export function selectMcpReadResourcePractice(dependencies: McpReadResourceDependencies & { preferredProvider?: McpReadResourcePracticeProviderName } = {}): McpReadResourcePracticeSelection {
  for (const practice of orderedPractices(dependencies.preferredProvider)) {
    const provider = practice.createProvider(dependencies);
    if (provider !== undefined) return { providerName: practice.providerName, practice, provider };
  }
  return { providerName: "praxis-native", practice: { providerName: "praxis-native", source: { kind: "praxis-native", label: "Praxis dry-run fallback" }, directCliSupport: false, sideEffectPolicy: "runtime-owned-client", notes: ["No runtime MCP readResource provider is available; dry-run remains available."], createProvider: () => undefined } };
}

function practiceAuditMetadata(selection: McpReadResourcePracticeSelection): Readonly<Record<string, unknown>> {
  return buildMcpPracticeAuditMetadata({ providerName: selection.providerName, sourceLabel: selection.practice.source.label, sourceKind: selection.practice.source.kind, sourcePath: selection.practice.source.path, directCliSupport: selection.practice.directCliSupport, sideEffectPolicy: selection.practice.sideEffectPolicy, notes: selection.practice.notes });
}

export async function executeMcpResourceRead(request: McpReadResourceBestPracticeRequest | unknown = {}): Promise<McpReadResourceResult> {
  const requestRecord = isJsonObject(request) ? (request as McpReadResourceBestPracticeRequest) : {};
  const selection = selectMcpReadResourcePractice({ executor: requestRecord.executor, provider: requestRecord.provider, preferredProvider: requestRecord.preferredProvider });
  const context = isJsonObject(requestRecord.context) ? requestRecord.context : undefined;
  return executeMcpResourceReadCore(isJsonObject(request) ? { ...requestRecord, context: { ...context, auditMetadata: { ...(context?.auditMetadata ?? {}), ...practiceAuditMetadata(selection) } } } : request, selection.provider);
}

export const mcpReadResourceBaseToolDefinition = createMcpBaseToolDefinition<McpReadResourceHandlerInput, McpReadResourceOutput>({
  toolId: "mcp.readResource",
  title: "MCP Read Resource",
  description: "Read a resource through a runtime-owned MCP server client.",
  summary: "Use mcp.readResource to fetch MCP resource contents while runtime owns the MCP session.",
  storageGroup: "resource",
  riskLevel: "normal",
  permissionHints: ["mcp:access", "mcp:resource:read"],
  dependencies: mcpReadResourceDependencyDeclarations,
  inputSchema: jsonSchema("mcp.readResource.input", { type: "object", additionalProperties: true }),
  outputSchema: jsonSchema("mcp.readResource.output", { type: "object", additionalProperties: true }),
});

export const mcpReadResourceHandler: BaseToolHandler<McpReadResourceHandlerInput, McpReadResourceOutput> = createMcpCoreHandler(
  mcpReadResourceBaseToolDefinition,
  async (request) => {
    const selection = selectMcpReadResourcePractice({ executor: request.executor, provider: request.input.provider, preferredProvider: request.input.preferredProvider });
    const inputContext = request.input.context ?? {};
    const context: McpReadResourceContext = { ...inputContext, runtimeId: inputContext.runtimeId ?? request.runtimeId, sessionId: inputContext.sessionId ?? request.sessionId, invocationId: inputContext.invocationId ?? request.toolCallId, auditMetadata: injectRuntimeInvocationMetadata({ ...practiceAuditMetadata(selection), ...(request.metadata ?? {}) }, inputContext.auditMetadata, request) };
    return executeMcpResourceReadCore({ ...request.input, context }, selection.provider);
  },
);

export type { McpReadResourceResult };
export { mcpReadResourceDescriptor, planMcpResourceRead };
