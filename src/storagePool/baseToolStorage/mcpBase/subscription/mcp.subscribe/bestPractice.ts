import type { BaseToolExecutorPort } from "../../../../../agentCore/agent_executionEngine/basic_toolLayer/baseTools/baseToolExecutorPort.js";
import type { BaseToolHandler } from "../../../../../agentCore/agent_executionEngine/basic_toolLayer/baseTools/baseToolDefinition.js";
import {
  buildMcpPracticeAuditMetadata,
  createMcpBaseToolDefinition,
  createMcpCoreHandler,
  injectRuntimeInvocationMetadata,
  isJsonObject,
  jsonSchema,
} from "../../_shared/baseToolAdapter.js";
import { anthropicMcpSubscribePractice } from "./anthropic.js";
import { deepmindMcpSubscribePractice } from "./deepmind.js";
import {
  mcpSubscribeDependencyDeclarations,
  type McpSubscribeDependencies,
  type McpSubscribePracticeProviderName,
  type McpSubscribeProviderPractice,
} from "./dependencies.js";
import { openaiMcpSubscribePractice } from "./openai.js";
import {
  executeMcpSubscribe as executeMcpSubscribeCore,
  mcpSubscribeDescriptor,
  planMcpSubscribe,
  type McpSubscribeContext,
  type McpSubscribeOutput,
  type McpSubscribeProvider,
  type McpSubscribeRequest,
  type McpSubscribeResult,
} from "./core.js";

export * from "./core.js";

export type McpSubscribeBestPracticeRequest = McpSubscribeRequest & {
  executor?: BaseToolExecutorPort;
  provider?: McpSubscribeProvider;
  preferredProvider?: McpSubscribePracticeProviderName;
};
export type McpSubscribeHandlerInput = Omit<McpSubscribeBestPracticeRequest, "executor">;
export type McpSubscribePracticeSelection = {
  providerName: McpSubscribePracticeProviderName;
  practice: McpSubscribeProviderPractice;
  provider?: McpSubscribeProvider;
};
export const mcpSubscribeProviderPractices = [anthropicMcpSubscribePractice, openaiMcpSubscribePractice, deepmindMcpSubscribePractice] as const;
export const mcpSubscribeBestPracticeDescriptor = {
  toolId: "mcp.subscribe",
  bestPractice: "storage-owned-mcp-subscribe-with-runtime-owned-client",
  providerOrder: ["anthropic", "openai", "deepmind"],
  dependencies: mcpSubscribeDependencyDeclarations,
} as const;

function orderedPractices(preferredProvider: McpSubscribePracticeProviderName | undefined): readonly McpSubscribeProviderPractice[] {
  return preferredProvider === undefined
    ? mcpSubscribeProviderPractices
    : [
        ...mcpSubscribeProviderPractices.filter((practice) => practice.providerName === preferredProvider),
        ...mcpSubscribeProviderPractices.filter((practice) => practice.providerName !== preferredProvider),
      ];
}

export function selectMcpSubscribePractice(dependencies: McpSubscribeDependencies & { preferredProvider?: McpSubscribePracticeProviderName } = {}): McpSubscribePracticeSelection {
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
      notes: ["No runtime MCP subscribe provider is available; dry-run remains available."],
      createProvider: () => undefined,
    },
  };
}

function practiceAuditMetadata(selection: McpSubscribePracticeSelection): Readonly<Record<string, unknown>> {
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

export async function executeMcpSubscribe(request: McpSubscribeBestPracticeRequest | unknown = {}): Promise<McpSubscribeResult> {
  const requestRecord = isJsonObject(request) ? (request as McpSubscribeBestPracticeRequest) : {};
  const selection = selectMcpSubscribePractice({
    executor: requestRecord.executor,
    provider: requestRecord.provider,
    preferredProvider: requestRecord.preferredProvider,
  });
  const context = isJsonObject(requestRecord.context) ? requestRecord.context : undefined;
  return executeMcpSubscribeCore(
    isJsonObject(request)
      ? { ...requestRecord, context: { ...context, auditMetadata: { ...(context?.auditMetadata ?? {}), ...practiceAuditMetadata(selection) } } }
      : request,
    selection.provider,
  );
}

export const mcpSubscribeBaseToolDefinition = createMcpBaseToolDefinition<McpSubscribeHandlerInput, McpSubscribeOutput>({
  toolId: "mcp.subscribe",
  title: "MCP Subscribe",
  description: "Request runtime to subscribe to a configured MCP resource, event, or tool notification stream.",
  summary: "Use mcp.subscribe to ask the runtime-owned MCP manager to create a subscription handle.",
  storageGroup: "subscription",
  riskLevel: "risky",
  permissionHints: ["mcp:access", "mcp:subscription:write"],
  dependencies: mcpSubscribeDependencyDeclarations,
  inputSchema: jsonSchema("mcp.subscribe.input", { type: "object", additionalProperties: true }),
  outputSchema: jsonSchema("mcp.subscribe.output", { type: "object", additionalProperties: true }),
});

export const mcpSubscribeHandler: BaseToolHandler<McpSubscribeHandlerInput, McpSubscribeOutput> = createMcpCoreHandler(
  mcpSubscribeBaseToolDefinition,
  async (request) => {
    const selection = selectMcpSubscribePractice({
      executor: request.executor,
      provider: request.input.provider,
      preferredProvider: request.input.preferredProvider,
    });
    const inputContext = request.input.context ?? {};
    const context: McpSubscribeContext = {
      ...inputContext,
      runtimeId: inputContext.runtimeId ?? request.runtimeId,
      sessionId: inputContext.sessionId ?? request.sessionId,
      invocationId: inputContext.invocationId ?? request.toolCallId,
      auditMetadata: injectRuntimeInvocationMetadata({ ...practiceAuditMetadata(selection), ...(request.metadata ?? {}) }, inputContext.auditMetadata, request),
    };
    return executeMcpSubscribeCore({ ...request.input, context }, selection.provider);
  },
);

export type { McpSubscribeResult };
export { mcpSubscribeDescriptor, planMcpSubscribe };
