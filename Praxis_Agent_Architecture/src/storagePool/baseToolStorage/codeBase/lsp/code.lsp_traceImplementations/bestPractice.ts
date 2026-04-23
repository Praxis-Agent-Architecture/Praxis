import type { BaseToolHandler } from "../../../../../agentCore/agent_executionEngine/basic_toolLayer/baseTools/baseToolDefinition.js";
import type { BaseToolExecutorPort } from "../../../../../agentCore/agent_executionEngine/basic_toolLayer/baseTools/baseToolExecutorPort.js";
import {
  buildPracticeAuditMetadata,
  createLspBaseToolDefinition,
  createLspCoreHandler,
  injectInvocationAudit,
  jsonSchema,
  lspCommonSchemaFragments,
  normalizeLspDependencyDeclarations,
  preferAnthropicExecutor,
} from "../_shared/baseToolAdapter.js";
import {
  traceLspImplementations as traceLspImplementationsCore,
  type LspTraceImplementationsOutput,
  type LspTraceImplementationsProvider,
  type LspTraceImplementationsRequest,
} from "./core.js";
import { anthropicLspTraceImplementationsPractice } from "./anthropic.js";
import { lspTraceImplementationsDependencyDeclarations, type LspTraceImplementationsPracticeProviderName } from "./dependencies.js";
import { deepmindLspTraceImplementationsPractice } from "./deepmind.js";
import { openaiLspTraceImplementationsPractice } from "./openai.js";

export * from "./core.js";

export type LspTraceImplementationsBestPracticeRequest = LspTraceImplementationsRequest & {
  preferredProvider?: LspTraceImplementationsPracticeProviderName;
};

export const lspTraceImplementationsProviderPractices = [
  anthropicLspTraceImplementationsPractice,
  openaiLspTraceImplementationsPractice,
  deepmindLspTraceImplementationsPractice,
] as const;

export const lspTraceImplementationsBestPracticeDescriptor = {
  toolId: "code.lsp_traceImplementations",
  bestPractice: "anthropic-host-executor-or-shared-stdio-lsp-runtime",
  sourcePriority: ["cli", "agent-sdk", "api-sdk", "praxis-native"],
  providerPractices: lspTraceImplementationsProviderPractices,
  dependencies: lspTraceImplementationsDependencyDeclarations,
} as const;

function createExecutorProvider(executor: BaseToolExecutorPort | undefined): LspTraceImplementationsProvider | undefined {
  const traceImplementations = executor?.lsp?.traceImplementations;
  if (traceImplementations === undefined) {
    return undefined;
  }

  return async (target, context) => {
    const result = await traceImplementations({
      target,
      context: {
        invocationId: context.invocationId,
        workspaceRoot: context.workspaceRoot,
        auditMetadata: context.auditMetadata,
      },
    });
    if (!result.ok) throw new Error(result.error.message);
    return result.output.locations.map((location) => ({ ...location, source: "provider" as const }));
  };
}

export const lspTraceImplementationsBaseToolDefinition = createLspBaseToolDefinition<
  LspTraceImplementationsBestPracticeRequest,
  LspTraceImplementationsOutput
>({
  toolId: "code.lsp_traceImplementations",
  title: "Code LSP Trace Implementations",
  description: "Trace implementation sites for a symbol through a governed LSP provider.",
  summary: "Use code.lsp_traceImplementations when the agent needs concrete implementations behind an interface or abstract symbol.",
  permissionHints: ["workspace:read", "lsp:read"],
  dependencies: normalizeLspDependencyDeclarations(lspTraceImplementationsDependencyDeclarations),
  inputSchema: jsonSchema("code.lsp_traceImplementations.input", {
    type: "object",
    additionalProperties: true,
    required: ["target"],
    properties: {
      target: {
        type: "object",
        additionalProperties: false,
        required: ["filePath", "line", "character"],
        properties: {
          filePath: { type: "string", minLength: 1 },
          line: { type: "integer", minimum: 0 },
          character: { type: "integer", minimum: 0 },
          languageId: { type: "string" },
        },
      },
      context: lspCommonSchemaFragments.invocationContext,
      preferredProvider: { type: "string", enum: ["anthropic", "openai", "deepmind", "praxis-native"] },
    },
  }),
  outputSchema: jsonSchema("code.lsp_traceImplementations.output", {
    type: "object",
    additionalProperties: true,
    required: ["kind", "target", "implementations", "dryRun", "providerCalled"],
    properties: {
      kind: { const: "agentCore.basicTool.lsp.traceImplementations" },
      target: {
        type: "object",
        additionalProperties: false,
        required: ["filePath", "line", "character"],
        properties: {
          filePath: { type: "string" },
          line: { type: "integer", minimum: 0 },
          character: { type: "integer", minimum: 0 },
          languageId: { type: "string" },
        },
      },
      implementations: { type: "array", items: { type: "object", additionalProperties: true } },
      dryRun: { type: "boolean" },
      providerCalled: { type: "boolean" },
    },
  }),
});

export const lspTraceImplementationsHandler: BaseToolHandler<
  LspTraceImplementationsBestPracticeRequest,
  LspTraceImplementationsOutput
> = createLspCoreHandler(lspTraceImplementationsBaseToolDefinition, async (request) => {
  const selection = preferAnthropicExecutor(
    request.executor,
    (executor) => executor.lsp?.traceImplementations !== undefined,
    lspTraceImplementationsProviderPractices,
    request.input.preferredProvider,
  );

  return await traceLspImplementationsCore({
    ...request.input,
    provider: request.input.provider ?? createExecutorProvider(request.executor),
    context: {
      ...request.input.context,
      invocationId: request.input.context?.invocationId ?? request.toolCallId,
      auditMetadata: injectInvocationAudit(
        {
          ...buildPracticeAuditMetadata(selection),
          ...(request.metadata ?? {}),
        },
        request.input.context?.auditMetadata,
        request,
      ),
    },
  });
});
