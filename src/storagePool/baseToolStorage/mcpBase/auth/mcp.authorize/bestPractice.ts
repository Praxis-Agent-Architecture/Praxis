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
import { anthropicMcpAuthorizePractice } from "./anthropic.js";
import { deepmindMcpAuthorizePractice } from "./deepmind.js";
import {
  mcpAuthorizeDependencyDeclarations,
  type McpAuthorizeDependencies,
  type McpAuthorizePracticeProviderName,
  type McpAuthorizeProviderPractice,
} from "./dependencies.js";
import { openaiMcpAuthorizePractice } from "./openai.js";
import {
  executeMcpAuthorize as executeMcpAuthorizeCore,
  mcpAuthorizeDescriptor,
  planMcpAuthorize,
  type McpAuthorizeContext,
  type McpAuthorizeOutput,
  type McpAuthorizeProvider,
  type McpAuthorizeRequest,
  type McpAuthorizeResult,
} from "./core.js";

export * from "./core.js";

export type McpAuthorizeBestPracticeRequest = McpAuthorizeRequest & {
  executor?: BaseToolExecutorPort;
  provider?: McpAuthorizeProvider;
  preferredProvider?: McpAuthorizePracticeProviderName;
};
export type McpAuthorizeHandlerInput = Omit<McpAuthorizeBestPracticeRequest, "executor">;
export type McpAuthorizePracticeSelection = {
  providerName: McpAuthorizePracticeProviderName;
  practice: McpAuthorizeProviderPractice;
  provider?: McpAuthorizeProvider;
};

export const mcpAuthorizeProviderPractices = [
  anthropicMcpAuthorizePractice,
  openaiMcpAuthorizePractice,
  deepmindMcpAuthorizePractice,
] as const;

export const mcpAuthorizeBestPracticeDescriptor = {
  toolId: "mcp.authorize",
  bestPractice: "storage-owned-mcp-authorize-with-runtime-owned-policy-client",
  providerOrder: ["anthropic", "openai", "deepmind"],
  dependencies: mcpAuthorizeDependencyDeclarations,
} as const;

function orderedPractices(preferredProvider: McpAuthorizePracticeProviderName | undefined): readonly McpAuthorizeProviderPractice[] {
  return preferredProvider === undefined
    ? mcpAuthorizeProviderPractices
    : [
        ...mcpAuthorizeProviderPractices.filter((practice) => practice.providerName === preferredProvider),
        ...mcpAuthorizeProviderPractices.filter((practice) => practice.providerName !== preferredProvider),
      ];
}

export function selectMcpAuthorizePractice(
  dependencies: McpAuthorizeDependencies & { preferredProvider?: McpAuthorizePracticeProviderName } = {},
): McpAuthorizePracticeSelection {
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
      notes: ["No runtime MCP authorization provider is available; dry-run remains available."],
      createProvider: () => undefined,
    },
  };
}

function practiceAuditMetadata(selection: McpAuthorizePracticeSelection): Readonly<Record<string, unknown>> {
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

export async function executeMcpAuthorize(request: McpAuthorizeBestPracticeRequest | unknown = {}): Promise<McpAuthorizeResult> {
  const requestRecord = isJsonObject(request) ? (request as McpAuthorizeBestPracticeRequest) : {};
  const selection = selectMcpAuthorizePractice({
    executor: requestRecord.executor,
    provider: requestRecord.provider,
    preferredProvider: requestRecord.preferredProvider,
  });
  const context = isJsonObject(requestRecord.context) ? requestRecord.context : undefined;
  return executeMcpAuthorizeCore(
    isJsonObject(request)
      ? { ...requestRecord, context: { ...context, auditMetadata: { ...(context?.auditMetadata ?? {}), ...practiceAuditMetadata(selection) } } }
      : request,
    selection.provider,
  );
}

export const mcpAuthorizeBaseToolDefinition = createMcpBaseToolDefinition<McpAuthorizeHandlerInput, McpAuthorizeOutput>({
  toolId: "mcp.authorize",
  title: "MCP Authorize",
  description: "Ask runtime to authorize a fixed MCP operation for a subject.",
  summary: "Use mcp.authorize to request a runtime-owned policy decision for MCP calls, resources, subscriptions, or cache access.",
  storageGroup: "auth",
  riskLevel: "normal",
  permissionHints: ["mcp:auth", "mcp:read"],
  dependencies: mcpAuthorizeDependencyDeclarations,
  inputSchema: jsonSchema("mcp.authorize.input", { type: "object", additionalProperties: true }),
  outputSchema: jsonSchema("mcp.authorize.output", { type: "object", additionalProperties: true }),
});

export const mcpAuthorizeHandler: BaseToolHandler<McpAuthorizeHandlerInput, McpAuthorizeOutput> = createMcpCoreHandler(
  mcpAuthorizeBaseToolDefinition,
  async (request) => {
    const selection = selectMcpAuthorizePractice({
      executor: request.executor,
      provider: request.input.provider,
      preferredProvider: request.input.preferredProvider,
    });
    const inputContext = request.input.context ?? {};
    const context: McpAuthorizeContext = {
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
    return executeMcpAuthorizeCore({ ...request.input, context }, selection.provider);
  },
);

export type { McpAuthorizeResult };
export { mcpAuthorizeDescriptor, planMcpAuthorize };
