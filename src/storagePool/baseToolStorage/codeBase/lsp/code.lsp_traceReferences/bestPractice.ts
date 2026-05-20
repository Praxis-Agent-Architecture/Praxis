import type { BaseToolHandler } from "../../../../../agentCore_executionEngine/basic_toolLayer/baseTools/baseToolDefinition.js";
import type { BaseToolExecutorPort } from "../../../../../agentCore_executionEngine/basic_toolLayer/baseTools/baseToolExecutorPort.js";
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
  traceLspReferences as traceLspReferencesCore,
  type LspTraceReferencesOutput,
  type LspTraceReferencesProvider,
  type LspTraceReferencesRequest,
} from "./core.js";
import { anthropicLspTraceReferencesPractice } from "./anthropic.js";
import { lspTraceReferencesDependencyDeclarations, type LspTraceReferencesPracticeProviderName } from "./dependencies.js";
import { deepmindLspTraceReferencesPractice } from "./deepmind.js";
import { openaiLspTraceReferencesPractice } from "./openai.js";

export * from "./core.js";

export type LspTraceReferencesBestPracticeRequest = LspTraceReferencesRequest & {
  preferredProvider?: LspTraceReferencesPracticeProviderName;
};

export const lspTraceReferencesProviderPractices = [
  anthropicLspTraceReferencesPractice,
  openaiLspTraceReferencesPractice,
  deepmindLspTraceReferencesPractice,
] as const;

export const lspTraceReferencesBestPracticeDescriptor = {
  toolId: "code.lsp_traceReferences",
  bestPractice: "anthropic-host-executor-or-shared-stdio-lsp-runtime",
  sourcePriority: ["cli", "agent-sdk", "api-sdk", "praxis-native"],
  providerPractices: lspTraceReferencesProviderPractices,
  dependencies: lspTraceReferencesDependencyDeclarations,
} as const;

function createExecutorProvider(executor: BaseToolExecutorPort | undefined): LspTraceReferencesProvider | undefined {
  const traceReferences = executor?.lsp?.traceReferences;
  if (traceReferences === undefined) {
    return undefined;
  }

  return async (target, context, includeDeclaration) => {
    const result = await traceReferences({
      target,
      includeDeclaration,
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

export const lspTraceReferencesBaseToolDefinition = createLspBaseToolDefinition<
  LspTraceReferencesBestPracticeRequest,
  LspTraceReferencesOutput
>({
  toolId: "code.lsp_traceReferences",
  title: "Code LSP Trace References",
  description: "Trace symbol references through a governed LSP provider.",
  summary: "Use code.lsp_traceReferences when the agent needs cross-file or in-file references for a symbol.",
  permissionHints: ["workspace:read", "lsp:read"],
  dependencies: normalizeLspDependencyDeclarations(lspTraceReferencesDependencyDeclarations),
  inputSchema: jsonSchema("code.lsp_traceReferences.input", {
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
      includeDeclaration: { type: "boolean" },
      context: lspCommonSchemaFragments.invocationContext,
      preferredProvider: { type: "string", enum: ["anthropic", "openai", "deepmind", "praxis-native"] },
    },
  }),
  outputSchema: jsonSchema("code.lsp_traceReferences.output", {
    type: "object",
    additionalProperties: true,
    required: ["kind", "target", "references", "includeDeclaration", "dryRun", "providerCalled"],
    properties: {
      kind: { const: "agentCore.basicTool.lsp.traceReferences" },
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
      references: { type: "array", items: { type: "object", additionalProperties: true } },
      includeDeclaration: { type: "boolean" },
      dryRun: { type: "boolean" },
      providerCalled: { type: "boolean" },
    },
  }),
});

export const lspTraceReferencesHandler: BaseToolHandler<
  LspTraceReferencesBestPracticeRequest,
  LspTraceReferencesOutput
> = createLspCoreHandler(lspTraceReferencesBaseToolDefinition, async (request) => {
  const selection = preferAnthropicExecutor(
    request.executor,
    (executor) => executor.lsp?.traceReferences !== undefined,
    lspTraceReferencesProviderPractices,
    request.input.preferredProvider,
  );

  return await traceLspReferencesCore({
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
