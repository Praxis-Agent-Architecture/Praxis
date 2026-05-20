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
import { anthropicMcpAuthenticatePractice } from "./anthropic.js";
import { deepmindMcpAuthenticatePractice } from "./deepmind.js";
import {
  mcpAuthenticateDependencyDeclarations,
  type McpAuthenticateDependencies,
  type McpAuthenticatePracticeProviderName,
  type McpAuthenticateProviderPractice,
} from "./dependencies.js";
import { openaiMcpAuthenticatePractice } from "./openai.js";
import {
  executeMcpAuthenticate as executeMcpAuthenticateCore,
  mcpAuthenticateDescriptor,
  planMcpAuthenticate,
  type McpAuthenticateContext,
  type McpAuthenticateOutput,
  type McpAuthenticateProvider,
  type McpAuthenticateRequest,
  type McpAuthenticateResult,
} from "./core.js";

export * from "./core.js";

export type McpAuthenticateBestPracticeRequest = McpAuthenticateRequest & {
  executor?: BaseToolExecutorPort;
  provider?: McpAuthenticateProvider;
  preferredProvider?: McpAuthenticatePracticeProviderName;
};
export type McpAuthenticateHandlerInput = Omit<McpAuthenticateBestPracticeRequest, "executor">;
export type McpAuthenticatePracticeSelection = {
  providerName: McpAuthenticatePracticeProviderName;
  practice: McpAuthenticateProviderPractice;
  provider?: McpAuthenticateProvider;
};

export const mcpAuthenticateProviderPractices = [
  anthropicMcpAuthenticatePractice,
  openaiMcpAuthenticatePractice,
  deepmindMcpAuthenticatePractice,
] as const;

export const mcpAuthenticateBestPracticeDescriptor = {
  toolId: "mcp.authenticate",
  bestPractice: "storage-owned-mcp-authenticate-with-runtime-owned-auth-client",
  providerOrder: ["anthropic", "openai", "deepmind"],
  dependencies: mcpAuthenticateDependencyDeclarations,
} as const;

function orderedPractices(preferredProvider: McpAuthenticatePracticeProviderName | undefined): readonly McpAuthenticateProviderPractice[] {
  return preferredProvider === undefined
    ? mcpAuthenticateProviderPractices
    : [
        ...mcpAuthenticateProviderPractices.filter((practice) => practice.providerName === preferredProvider),
        ...mcpAuthenticateProviderPractices.filter((practice) => practice.providerName !== preferredProvider),
      ];
}

export function selectMcpAuthenticatePractice(
  dependencies: McpAuthenticateDependencies & { preferredProvider?: McpAuthenticatePracticeProviderName } = {},
): McpAuthenticatePracticeSelection {
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
      notes: ["No runtime MCP authentication provider is available; dry-run remains available."],
      createProvider: () => undefined,
    },
  };
}

function practiceAuditMetadata(selection: McpAuthenticatePracticeSelection): Readonly<Record<string, unknown>> {
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

export async function executeMcpAuthenticate(request: McpAuthenticateBestPracticeRequest | unknown = {}): Promise<McpAuthenticateResult> {
  const requestRecord = isJsonObject(request) ? (request as McpAuthenticateBestPracticeRequest) : {};
  const selection = selectMcpAuthenticatePractice({
    executor: requestRecord.executor,
    provider: requestRecord.provider,
    preferredProvider: requestRecord.preferredProvider,
  });
  const context = isJsonObject(requestRecord.context) ? requestRecord.context : undefined;
  return executeMcpAuthenticateCore(
    isJsonObject(request)
      ? { ...requestRecord, context: { ...context, auditMetadata: { ...(context?.auditMetadata ?? {}), ...practiceAuditMetadata(selection) } } }
      : request,
    selection.provider,
  );
}

export const mcpAuthenticateBaseToolDefinition = createMcpBaseToolDefinition<McpAuthenticateHandlerInput, McpAuthenticateOutput>({
  toolId: "mcp.authenticate",
  title: "MCP Authenticate",
  description: "Ask runtime to authenticate a managed MCP server using a credential reference.",
  summary: "Use mcp.authenticate to request runtime-owned MCP authentication without exposing raw credential material.",
  storageGroup: "auth",
  riskLevel: "risky",
  permissionHints: ["mcp:connect", "mcp:auth"],
  dependencies: mcpAuthenticateDependencyDeclarations,
  inputSchema: jsonSchema("mcp.authenticate.input", { type: "object", additionalProperties: true }),
  outputSchema: jsonSchema("mcp.authenticate.output", { type: "object", additionalProperties: true }),
});

export const mcpAuthenticateHandler: BaseToolHandler<McpAuthenticateHandlerInput, McpAuthenticateOutput> = createMcpCoreHandler(
  mcpAuthenticateBaseToolDefinition,
  async (request) => {
    const selection = selectMcpAuthenticatePractice({
      executor: request.executor,
      provider: request.input.provider,
      preferredProvider: request.input.preferredProvider,
    });
    const inputContext = request.input.context ?? {};
    const context: McpAuthenticateContext = {
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
    return executeMcpAuthenticateCore({ ...request.input, context }, selection.provider);
  },
);

export type { McpAuthenticateResult };
export { mcpAuthenticateDescriptor, planMcpAuthenticate };
