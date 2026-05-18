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
import { anthropicMcpStreamPractice } from "./anthropic.js";
import { deepmindMcpStreamPractice } from "./deepmind.js";
import {
  mcpStreamDependencyDeclarations,
  type McpStreamDependencies,
  type McpStreamPracticeProviderName,
  type McpStreamProviderPractice,
} from "./dependencies.js";
import { openaiMcpStreamPractice } from "./openai.js";
import {
  executeMcpStream as executeMcpStreamCore,
  mcpStreamDescriptor,
  planMcpStream,
  type McpStreamContext,
  type McpStreamOutput,
  type McpStreamProvider,
  type McpStreamRequest,
  type McpStreamResult,
} from "./core.js";

export * from "./core.js";

export type McpStreamBestPracticeRequest = McpStreamRequest & {
  executor?: BaseToolExecutorPort;
  provider?: McpStreamProvider;
  preferredProvider?: McpStreamPracticeProviderName;
};
export type McpStreamHandlerInput = Omit<McpStreamBestPracticeRequest, "executor">;
export type McpStreamPracticeSelection = {
  providerName: McpStreamPracticeProviderName;
  practice: McpStreamProviderPractice;
  provider?: McpStreamProvider;
};

export const mcpStreamProviderPractices = [anthropicMcpStreamPractice, openaiMcpStreamPractice, deepmindMcpStreamPractice] as const;
export const mcpStreamBestPracticeDescriptor = {
  toolId: "mcp.stream",
  bestPractice: "storage-owned-mcp-stream-with-runtime-owned-client",
  providerOrder: ["anthropic", "openai", "deepmind"],
  dependencies: mcpStreamDependencyDeclarations,
} as const;

function orderedPractices(preferredProvider: McpStreamPracticeProviderName | undefined): readonly McpStreamProviderPractice[] {
  return preferredProvider === undefined
    ? mcpStreamProviderPractices
    : [
        ...mcpStreamProviderPractices.filter((practice) => practice.providerName === preferredProvider),
        ...mcpStreamProviderPractices.filter((practice) => practice.providerName !== preferredProvider),
      ];
}

export function selectMcpStreamPractice(dependencies: McpStreamDependencies & { preferredProvider?: McpStreamPracticeProviderName } = {}): McpStreamPracticeSelection {
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
      notes: ["No runtime MCP stream provider is available; dry-run remains available."],
      createProvider: () => undefined,
    },
  };
}

function practiceAuditMetadata(selection: McpStreamPracticeSelection): Readonly<Record<string, unknown>> {
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

export async function executeMcpStream(request: McpStreamBestPracticeRequest | unknown = {}): Promise<McpStreamResult> {
  const requestRecord = isJsonObject(request) ? (request as McpStreamBestPracticeRequest) : {};
  const selection = selectMcpStreamPractice({
    executor: requestRecord.executor,
    provider: requestRecord.provider,
    preferredProvider: requestRecord.preferredProvider,
  });
  const context = isJsonObject(requestRecord.context) ? requestRecord.context : undefined;
  return executeMcpStreamCore(
    isJsonObject(request)
      ? { ...requestRecord, context: { ...context, auditMetadata: { ...(context?.auditMetadata ?? {}), ...practiceAuditMetadata(selection) } } }
      : request,
    selection.provider,
  );
}

export const mcpStreamBaseToolDefinition = createMcpBaseToolDefinition<McpStreamHandlerInput, McpStreamOutput>({
  toolId: "mcp.stream",
  title: "MCP Stream",
  description: "Request runtime to start or collect a governed MCP streaming tool call without owning stream handles in baseTool.",
  summary: "Use mcp.stream for runtime-owned MCP streams; runtime owns stream ids, progress, buffers, backpressure, and cancellation.",
  storageGroup: "execution",
  riskLevel: "risky",
  permissionHints: ["mcp:access", "mcp:stream", "mcp:call"],
  dependencies: mcpStreamDependencyDeclarations,
  inputSchema: jsonSchema("mcp.stream.input", { type: "object", additionalProperties: true }),
  outputSchema: jsonSchema("mcp.stream.output", { type: "object", additionalProperties: true }),
});

export const mcpStreamHandler: BaseToolHandler<McpStreamHandlerInput, McpStreamOutput> = createMcpCoreHandler(
  mcpStreamBaseToolDefinition,
  async (request) => {
    const selection = selectMcpStreamPractice({
      executor: request.executor,
      provider: request.input.provider,
      preferredProvider: request.input.preferredProvider,
    });
    const inputContext = request.input.context ?? {};
    const context: McpStreamContext = {
      ...inputContext,
      runtimeId: inputContext.runtimeId ?? request.runtimeId,
      sessionId: inputContext.sessionId ?? request.sessionId,
      invocationId: inputContext.invocationId ?? request.toolCallId,
      auditMetadata: injectRuntimeInvocationMetadata({ ...practiceAuditMetadata(selection), ...(request.metadata ?? {}) }, inputContext.auditMetadata, request),
    };
    return executeMcpStreamCore({ ...request.input, context }, selection.provider);
  },
);

export type { McpStreamResult };
export { mcpStreamDescriptor, planMcpStream };
