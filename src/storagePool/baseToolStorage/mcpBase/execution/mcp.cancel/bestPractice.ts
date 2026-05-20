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
import { anthropicMcpCancelPractice } from "./anthropic.js";
import { deepmindMcpCancelPractice } from "./deepmind.js";
import {
  mcpCancelDependencyDeclarations,
  type McpCancelDependencies,
  type McpCancelPracticeProviderName,
  type McpCancelProviderPractice,
} from "./dependencies.js";
import { openaiMcpCancelPractice } from "./openai.js";
import {
  executeMcpCancel as executeMcpCancelCore,
  mcpCancelDescriptor,
  planMcpCancel,
  type McpCancelContext,
  type McpCancelOutput,
  type McpCancelProvider,
  type McpCancelRequest,
  type McpCancelResult,
} from "./core.js";

export * from "./core.js";

export type McpCancelBestPracticeRequest = McpCancelRequest & {
  executor?: BaseToolExecutorPort;
  provider?: McpCancelProvider;
  preferredProvider?: McpCancelPracticeProviderName;
};
export type McpCancelHandlerInput = Omit<McpCancelBestPracticeRequest, "executor">;
export type McpCancelPracticeSelection = {
  providerName: McpCancelPracticeProviderName;
  practice: McpCancelProviderPractice;
  provider?: McpCancelProvider;
};

export const mcpCancelProviderPractices = [anthropicMcpCancelPractice, openaiMcpCancelPractice, deepmindMcpCancelPractice] as const;
export const mcpCancelBestPracticeDescriptor = {
  toolId: "mcp.cancel",
  bestPractice: "storage-owned-mcp-cancel-with-runtime-owned-client",
  providerOrder: ["anthropic", "openai", "deepmind"],
  dependencies: mcpCancelDependencyDeclarations,
} as const;

function orderedPractices(preferredProvider: McpCancelPracticeProviderName | undefined): readonly McpCancelProviderPractice[] {
  return preferredProvider === undefined
    ? mcpCancelProviderPractices
    : [
        ...mcpCancelProviderPractices.filter((practice) => practice.providerName === preferredProvider),
        ...mcpCancelProviderPractices.filter((practice) => practice.providerName !== preferredProvider),
      ];
}

export function selectMcpCancelPractice(dependencies: McpCancelDependencies & { preferredProvider?: McpCancelPracticeProviderName } = {}): McpCancelPracticeSelection {
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
      notes: ["No runtime MCP cancel provider is available; dry-run remains available."],
      createProvider: () => undefined,
    },
  };
}

function practiceAuditMetadata(selection: McpCancelPracticeSelection): Readonly<Record<string, unknown>> {
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

export async function executeMcpCancel(request: McpCancelBestPracticeRequest | unknown = {}): Promise<McpCancelResult> {
  const requestRecord = isJsonObject(request) ? (request as McpCancelBestPracticeRequest) : {};
  const selection = selectMcpCancelPractice({
    executor: requestRecord.executor,
    provider: requestRecord.provider,
    preferredProvider: requestRecord.preferredProvider,
  });
  const context = isJsonObject(requestRecord.context) ? requestRecord.context : undefined;
  return executeMcpCancelCore(
    isJsonObject(request)
      ? { ...requestRecord, context: { ...context, auditMetadata: { ...(context?.auditMetadata ?? {}), ...practiceAuditMetadata(selection) } } }
      : request,
    selection.provider,
  );
}

export const mcpCancelBaseToolDefinition = createMcpBaseToolDefinition<McpCancelHandlerInput, McpCancelOutput>({
  toolId: "mcp.cancel",
  title: "MCP Cancel",
  description: "Request runtime to cancel a live MCP execution by runtime-owned execution id.",
  summary: "Use mcp.cancel for governed cancellation of runtime-owned MCP executions; baseTool never stores live handles.",
  storageGroup: "execution",
  riskLevel: "risky",
  permissionHints: ["mcp:access", "mcp:cancel", "mcp:control"],
  dependencies: mcpCancelDependencyDeclarations,
  inputSchema: jsonSchema("mcp.cancel.input", { type: "object", additionalProperties: true }),
  outputSchema: jsonSchema("mcp.cancel.output", { type: "object", additionalProperties: true }),
});

export const mcpCancelHandler: BaseToolHandler<McpCancelHandlerInput, McpCancelOutput> = createMcpCoreHandler(
  mcpCancelBaseToolDefinition,
  async (request) => {
    const selection = selectMcpCancelPractice({
      executor: request.executor,
      provider: request.input.provider,
      preferredProvider: request.input.preferredProvider,
    });
    const inputContext = request.input.context ?? {};
    const context: McpCancelContext = {
      ...inputContext,
      runtimeId: inputContext.runtimeId ?? request.runtimeId,
      sessionId: inputContext.sessionId ?? request.sessionId,
      invocationId: inputContext.invocationId ?? request.toolCallId,
      auditMetadata: injectRuntimeInvocationMetadata({ ...practiceAuditMetadata(selection), ...(request.metadata ?? {}) }, inputContext.auditMetadata, request),
    };
    return executeMcpCancelCore({ ...request.input, context }, selection.provider);
  },
);

export type { McpCancelResult };
export { mcpCancelDescriptor, planMcpCancel };
