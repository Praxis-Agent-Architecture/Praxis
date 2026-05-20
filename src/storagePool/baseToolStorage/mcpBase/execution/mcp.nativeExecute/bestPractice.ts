import type { BaseToolExecutorPort } from "../../../../../executionEngine/basic_toolLayer/baseTools/baseToolExecutorPort.js";
import type { BaseToolHandler } from "../../../../../executionEngine/basic_toolLayer/baseTools/baseToolDefinition.js";
import {
  buildMcpPracticeAuditMetadata,
  createMcpBaseToolDefinition,
  createMcpCoreHandler,
  injectRuntimeInvocationMetadata,
  isJsonObject,
  jsonSchema,
} from "../../_shared/baseToolAdapter.js";
import { anthropicMcpNativeExecutePractice } from "./anthropic.js";
import { deepmindMcpNativeExecutePractice } from "./deepmind.js";
import {
  mcpNativeExecuteDependencyDeclarations,
  type McpNativeExecuteDependencies,
  type McpNativeExecutePracticeProviderName,
  type McpNativeExecuteProviderPractice,
} from "./dependencies.js";
import { openaiMcpNativeExecutePractice } from "./openai.js";
import {
  executeMcpNativeExecute as executeMcpNativeExecuteCore,
  mcpNativeExecuteDescriptor,
  planMcpNativeExecute,
  type McpNativeExecuteContext,
  type McpNativeExecuteOutput,
  type McpNativeExecuteProvider,
  type McpNativeExecuteRequest,
  type McpNativeExecuteResult,
} from "./core.js";

export * from "./core.js";

export type McpNativeExecuteBestPracticeRequest = McpNativeExecuteRequest & {
  executor?: BaseToolExecutorPort;
  provider?: McpNativeExecuteProvider;
  preferredProvider?: McpNativeExecutePracticeProviderName;
};
export type McpNativeExecuteHandlerInput = Omit<McpNativeExecuteBestPracticeRequest, "executor">;
export type McpNativeExecutePracticeSelection = {
  providerName: McpNativeExecutePracticeProviderName;
  practice: McpNativeExecuteProviderPractice;
  provider?: McpNativeExecuteProvider;
};

export const mcpNativeExecuteProviderPractices = [
  anthropicMcpNativeExecutePractice,
  openaiMcpNativeExecutePractice,
  deepmindMcpNativeExecutePractice,
] as const;

export const mcpNativeExecuteBestPracticeDescriptor = {
  toolId: "mcp.nativeExecute",
  bestPractice: "storage-owned-raw-mcp-contract-with-runtime-owned-client",
  providerOrder: ["anthropic", "openai", "deepmind"],
  dependencies: mcpNativeExecuteDependencyDeclarations,
} as const;

function orderedPractices(preferredProvider: McpNativeExecutePracticeProviderName | undefined): readonly McpNativeExecuteProviderPractice[] {
  if (preferredProvider === undefined) return mcpNativeExecuteProviderPractices;
  return [
    ...mcpNativeExecuteProviderPractices.filter((practice) => practice.providerName === preferredProvider),
    ...mcpNativeExecuteProviderPractices.filter((practice) => practice.providerName !== preferredProvider),
  ];
}

export function selectMcpNativeExecutePractice(
  dependencies: McpNativeExecuteDependencies & { preferredProvider?: McpNativeExecutePracticeProviderName } = {},
): McpNativeExecutePracticeSelection {
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
      sideEffectPolicy: "preview-only",
      notes: [
        "No runtime MCP nativeExecute provider is available; dry-run remains available.",
        "Raw MCP dispatch must not fall back to hidden local clients.",
      ],
      createProvider: () => undefined,
    },
  };
}

function practiceAuditMetadata(selection: McpNativeExecutePracticeSelection): Readonly<Record<string, unknown>> {
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

export async function executeMcpNativeExecute(request: McpNativeExecuteBestPracticeRequest | unknown = {}): Promise<McpNativeExecuteResult> {
  const requestRecord = isJsonObject(request) ? (request as McpNativeExecuteBestPracticeRequest) : {};
  const selection = selectMcpNativeExecutePractice({
    executor: requestRecord.executor,
    provider: requestRecord.provider,
    preferredProvider: requestRecord.preferredProvider,
  });
  const context = isJsonObject(requestRecord.context) ? requestRecord.context : undefined;
  return executeMcpNativeExecuteCore(
    isJsonObject(request)
      ? { ...requestRecord, context: { ...context, auditMetadata: { ...(context?.auditMetadata ?? {}), ...practiceAuditMetadata(selection) } } }
      : request,
    selection.provider,
  );
}

export const mcpNativeExecuteBaseToolDefinition = createMcpBaseToolDefinition<McpNativeExecuteHandlerInput, McpNativeExecuteOutput>({
  toolId: "mcp.nativeExecute",
  title: "MCP Native Execute",
  description: "Request a high-risk raw MCP method dispatch through the runtime-owned MCP manager.",
  summary: "Use mcp.nativeExecute only for runtime-admin raw MCP protocol dispatch; prefer fixed MCP tools such as mcp.call, mcp.readResource, and mcp.listTools.",
  storageGroup: "execution",
  riskLevel: "dangerous",
  permissionHints: ["mcp:access", "mcp:native-execute", "mcp:raw"],
  dependencies: mcpNativeExecuteDependencyDeclarations,
  inputSchema: jsonSchema("mcp.nativeExecute.input", { type: "object", additionalProperties: true }),
  outputSchema: jsonSchema("mcp.nativeExecute.output", { type: "object", additionalProperties: true }),
});

export const mcpNativeExecuteHandler: BaseToolHandler<McpNativeExecuteHandlerInput, McpNativeExecuteOutput> = createMcpCoreHandler(
  mcpNativeExecuteBaseToolDefinition,
  async (request) => {
    const selection = selectMcpNativeExecutePractice({
      executor: request.executor,
      provider: request.input.provider,
      preferredProvider: request.input.preferredProvider,
    });
    const inputContext = request.input.context ?? {};
    const context: McpNativeExecuteContext = {
      ...inputContext,
      runtimeId: inputContext.runtimeId ?? request.runtimeId,
      sessionId: inputContext.sessionId ?? request.sessionId,
      invocationId: inputContext.invocationId ?? request.toolCallId,
      auditMetadata: injectRuntimeInvocationMetadata(
        { ...practiceAuditMetadata(selection), ...(request.metadata ?? {}) },
        inputContext.auditMetadata,
        request,
      ),
    };
    return executeMcpNativeExecuteCore({ ...request.input, context }, selection.provider);
  },
);

export type { McpNativeExecuteResult };
export { mcpNativeExecuteDescriptor, planMcpNativeExecute };
