import type { BaseToolExecutorPort } from "../../../../../agentCore_executionEngine/basic_toolLayer/baseTools/baseToolExecutorPort.js";
import type { BaseToolHandler } from "../../../../../agentCore_executionEngine/basic_toolLayer/baseTools/baseToolDefinition.js";
import {
  buildMcpPracticeAuditMetadata,
  createMcpBaseToolDefinition,
  createMcpCoreHandler,
  injectRuntimeInvocationMetadata,
  isJsonObject,
  jsonSchema,
} from "../../_shared/baseToolAdapter.js";
import { anthropicMcpUnsubscribePractice } from "./anthropic.js";
import { deepmindMcpUnsubscribePractice } from "./deepmind.js";
import {
  mcpUnsubscribeDependencyDeclarations,
  type McpUnsubscribeDependencies,
  type McpUnsubscribePracticeProviderName,
  type McpUnsubscribeProviderPractice,
} from "./dependencies.js";
import { openaiMcpUnsubscribePractice } from "./openai.js";
import {
  executeMcpUnsubscribe as executeMcpUnsubscribeCore,
  mcpUnsubscribeDescriptor,
  planMcpUnsubscribe,
  type McpUnsubscribeContext,
  type McpUnsubscribeOutput,
  type McpUnsubscribeProvider,
  type McpUnsubscribeRequest,
  type McpUnsubscribeResult,
} from "./core.js";

export * from "./core.js";

export type McpUnsubscribeBestPracticeRequest = McpUnsubscribeRequest & {
  executor?: BaseToolExecutorPort;
  provider?: McpUnsubscribeProvider;
  preferredProvider?: McpUnsubscribePracticeProviderName;
};
export type McpUnsubscribeHandlerInput = Omit<McpUnsubscribeBestPracticeRequest, "executor">;
export type McpUnsubscribePracticeSelection = {
  providerName: McpUnsubscribePracticeProviderName;
  practice: McpUnsubscribeProviderPractice;
  provider?: McpUnsubscribeProvider;
};
export const mcpUnsubscribeProviderPractices = [anthropicMcpUnsubscribePractice, openaiMcpUnsubscribePractice, deepmindMcpUnsubscribePractice] as const;
export const mcpUnsubscribeBestPracticeDescriptor = {
  toolId: "mcp.unsubscribe",
  bestPractice: "storage-owned-mcp-unsubscribe-with-runtime-owned-client",
  providerOrder: ["anthropic", "openai", "deepmind"],
  dependencies: mcpUnsubscribeDependencyDeclarations,
} as const;

function orderedPractices(preferredProvider: McpUnsubscribePracticeProviderName | undefined): readonly McpUnsubscribeProviderPractice[] {
  return preferredProvider === undefined
    ? mcpUnsubscribeProviderPractices
    : [
        ...mcpUnsubscribeProviderPractices.filter((practice) => practice.providerName === preferredProvider),
        ...mcpUnsubscribeProviderPractices.filter((practice) => practice.providerName !== preferredProvider),
      ];
}

export function selectMcpUnsubscribePractice(dependencies: McpUnsubscribeDependencies & { preferredProvider?: McpUnsubscribePracticeProviderName } = {}): McpUnsubscribePracticeSelection {
  for (const practice of orderedPractices(dependencies.preferredProvider)) {
    const provider = practice.createProvider(dependencies);
    if (provider !== undefined) return { providerName: practice.providerName, practice, provider };
  }
  return {
    providerName: "praxis-native",
    practice: {
      providerName: "praxis-native",
      source: { kind: "praxis-native", label: "Praxis dry-run fallback" },
      directCliSupport: false,
      sideEffectPolicy: "runtime-owned-client",
      notes: ["No runtime MCP unsubscribe provider is available; dry-run remains available."],
      createProvider: () => undefined,
    },
  };
}

function practiceAuditMetadata(selection: McpUnsubscribePracticeSelection): Readonly<Record<string, unknown>> {
  return buildMcpPracticeAuditMetadata({
    providerName: selection.providerName,
    sourceLabel: selection.practice.source.label,
    sourceKind: selection.practice.source.kind,
    sourcePath: selection.practice.source.path,
    directCliSupport: selection.practice.directCliSupport,
    sideEffectPolicy: selection.practice.sideEffectPolicy,
    notes: selection.practice.notes,
  });
}

export async function executeMcpUnsubscribe(request: McpUnsubscribeBestPracticeRequest | unknown = {}): Promise<McpUnsubscribeResult> {
  const requestRecord = isJsonObject(request) ? (request as McpUnsubscribeBestPracticeRequest) : {};
  const selection = selectMcpUnsubscribePractice({
    executor: requestRecord.executor,
    provider: requestRecord.provider,
    preferredProvider: requestRecord.preferredProvider,
  });
  const context = isJsonObject(requestRecord.context) ? requestRecord.context : undefined;
  return executeMcpUnsubscribeCore(
    isJsonObject(request)
      ? { ...requestRecord, context: { ...context, auditMetadata: { ...(context?.auditMetadata ?? {}), ...practiceAuditMetadata(selection) } } }
      : request,
    selection.provider,
  );
}

export const mcpUnsubscribeBaseToolDefinition = createMcpBaseToolDefinition<McpUnsubscribeHandlerInput, McpUnsubscribeOutput>({
  toolId: "mcp.unsubscribe",
  title: "MCP Unsubscribe",
  description: "Request runtime to cancel a configured MCP subscription handle.",
  summary: "Use mcp.unsubscribe to ask the runtime-owned MCP manager to remove a subscription handle.",
  storageGroup: "subscription",
  riskLevel: "risky",
  permissionHints: ["mcp:access", "mcp:subscription:write"],
  dependencies: mcpUnsubscribeDependencyDeclarations,
  inputSchema: jsonSchema("mcp.unsubscribe.input", { type: "object", additionalProperties: true }),
  outputSchema: jsonSchema("mcp.unsubscribe.output", { type: "object", additionalProperties: true }),
});

export const mcpUnsubscribeHandler: BaseToolHandler<McpUnsubscribeHandlerInput, McpUnsubscribeOutput> = createMcpCoreHandler(
  mcpUnsubscribeBaseToolDefinition,
  async (request) => {
    const selection = selectMcpUnsubscribePractice({
      executor: request.executor,
      provider: request.input.provider,
      preferredProvider: request.input.preferredProvider,
    });
    const inputContext = request.input.context ?? {};
    const context: McpUnsubscribeContext = {
      ...inputContext,
      runtimeId: inputContext.runtimeId ?? request.runtimeId,
      sessionId: inputContext.sessionId ?? request.sessionId,
      invocationId: inputContext.invocationId ?? request.toolCallId,
      auditMetadata: injectRuntimeInvocationMetadata({ ...practiceAuditMetadata(selection), ...(request.metadata ?? {}) }, inputContext.auditMetadata, request),
    };
    return executeMcpUnsubscribeCore({ ...request.input, context }, selection.provider);
  },
);

export type { McpUnsubscribeResult };
export { mcpUnsubscribeDescriptor, planMcpUnsubscribe };
