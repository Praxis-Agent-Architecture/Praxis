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
import { anthropicMcpCallPractice } from "./anthropic.js";
import { deepmindMcpCallPractice } from "./deepmind.js";
import {
  mcpCallDependencyDeclarations,
  type McpCallDependencies,
  type McpCallPracticeProviderName,
  type McpCallProviderPractice,
} from "./dependencies.js";
import { openaiMcpCallPractice } from "./openai.js";
import {
  executeMcpCall as executeMcpCallCore,
  mcpCallDescriptor,
  planMcpCall,
  type McpCallContext,
  type McpCallOutput,
  type McpCallProvider,
  type McpCallRequest,
  type McpCallResult,
} from "./core.js";

export * from "./core.js";

export type McpCallBestPracticeRequest = McpCallRequest & {
  executor?: BaseToolExecutorPort;
  provider?: McpCallProvider;
  preferredProvider?: McpCallPracticeProviderName;
};
export type McpCallHandlerInput = Omit<McpCallBestPracticeRequest, "executor">;
export type McpCallPracticeSelection = {
  providerName: McpCallPracticeProviderName;
  practice: McpCallProviderPractice;
  provider?: McpCallProvider;
};

export const mcpCallProviderPractices = [
  anthropicMcpCallPractice,
  openaiMcpCallPractice,
  deepmindMcpCallPractice,
] as const;

export const mcpCallBestPracticeDescriptor = {
  toolId: "mcp.call",
  bestPractice: "storage-owned-mcp-call-with-runtime-owned-client",
  sourcePriority: ["cli", "agent-sdk", "api-sdk", "praxis-native"],
  providerOrder: ["anthropic", "openai", "deepmind"],
  dependencies: mcpCallDependencyDeclarations,
} as const;

function orderedPractices(preferredProvider: McpCallPracticeProviderName | undefined): readonly McpCallProviderPractice[] {
  if (preferredProvider === undefined) return mcpCallProviderPractices;
  return [
    ...mcpCallProviderPractices.filter((practice) => practice.providerName === preferredProvider),
    ...mcpCallProviderPractices.filter((practice) => practice.providerName !== preferredProvider),
  ];
}

export function selectMcpCallPractice(
  dependencies: McpCallDependencies & { preferredProvider?: McpCallPracticeProviderName } = {},
): McpCallPracticeSelection {
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
      sideEffectPolicy: "runtime-governed",
      notes: [
        "No injected or runtime MCP provider is available; dry-run remains available.",
        "Real mcp.call execution requires BaseToolExecutorPort.mcp.callTool.",
      ],
      createProvider: () => undefined,
    },
  };
}

function practiceAuditMetadata(selection: McpCallPracticeSelection): Readonly<Record<string, unknown>> {
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

export async function executeMcpCall(request: McpCallBestPracticeRequest | unknown = {}): Promise<McpCallResult> {
  const requestRecord = isJsonObject(request) ? (request as McpCallBestPracticeRequest) : {};
  const selection = selectMcpCallPractice({
    executor: requestRecord.executor,
    provider: requestRecord.provider,
    preferredProvider: requestRecord.preferredProvider,
  });
  const context = isJsonObject(requestRecord.context) ? requestRecord.context : undefined;
  return executeMcpCallCore(
    isJsonObject(request)
      ? {
          ...requestRecord,
          context: {
            ...context,
            auditMetadata: {
              ...(context?.auditMetadata ?? {}),
              ...practiceAuditMetadata(selection),
            },
          },
        }
      : request,
    { provider: selection.provider },
  );
}

const invocationContextSchema = {
  type: "object",
  additionalProperties: true,
  properties: {
    runtimeId: { type: "string" },
    sessionId: { type: "string" },
    invocationId: { type: "string" },
    dryRun: { type: "boolean" },
    guard: { type: "object", additionalProperties: true },
    allowedServerIds: { type: "array", items: { type: "string" } },
    grantedPermissions: { type: "array", items: { type: "string" } },
    requestedScopes: { type: "array", items: { type: "string" } },
    allowedScopes: { type: "array", items: { type: "string" } },
  },
} as const;

export const mcpCallBaseToolDefinition = createMcpBaseToolDefinition<McpCallHandlerInput, McpCallOutput>({
  toolId: "mcp.call",
  title: "MCP Call",
  description: "Invoke a runtime-owned MCP tool provider after JSON validation, scope checks, and explicit governance approval.",
  summary: "Use mcp.call for governed MCP tool calls; runtime owns sessions, transports, OAuth, progress, and cancellation.",
  storageGroup: "execution",
  riskLevel: "risky",
  permissionHints: ["mcp:access", "mcp:call"],
  dependencies: mcpCallDependencyDeclarations,
  inputSchema: jsonSchema("mcp.call.input", {
    type: "object",
    additionalProperties: true,
    properties: {
      target: {
        type: "object",
        additionalProperties: true,
        required: ["serverId"],
        properties: {
          serverId: { type: "string" },
          name: { type: "string" },
          toolName: { type: "string" },
          mode: { enum: ["tool", "service"] },
          arguments: { type: "object", additionalProperties: true },
          timeoutMs: { type: "number", exclusiveMinimum: 0 },
        },
      },
      context: invocationContextSchema,
      preferredProvider: { enum: ["anthropic", "openai", "deepmind", "praxis-native"] },
    },
  }),
  outputSchema: jsonSchema("mcp.call.output", { type: "object", additionalProperties: true }),
});

export const mcpCallHandler: BaseToolHandler<McpCallHandlerInput, McpCallOutput> = createMcpCoreHandler(
  mcpCallBaseToolDefinition,
  async (request) => {
    const selection = selectMcpCallPractice({
      executor: request.executor,
      provider: request.input.provider,
      preferredProvider: request.input.preferredProvider,
    });
    const inputContext = request.input.context ?? {};
    const context: McpCallContext = {
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
    return executeMcpCallCore({ ...request.input, context }, { provider: selection.provider });
  },
);

export type { McpCallResult };
export { mcpCallDescriptor, planMcpCall };
