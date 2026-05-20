import type { BaseToolHandler } from "../../../../../executionEngine/basic_toolLayer/baseTools/baseToolDefinition.js";
import type { BaseToolExecutorPort } from "../../../../../executionEngine/basic_toolLayer/baseTools/baseToolExecutorPort.js";
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
  suggestLspCodeActions as suggestLspCodeActionsCore,
  type LspSuggestCodeActionsOutput,
  type LspSuggestCodeActionsProvider,
  type LspSuggestCodeActionsRequest,
} from "./core.js";
import { anthropicLspSuggestCodeActionsPractice } from "./anthropic.js";
import { lspSuggestCodeActionsDependencyDeclarations, type LspSuggestCodeActionsPracticeProviderName } from "./dependencies.js";
import { deepmindLspSuggestCodeActionsPractice } from "./deepmind.js";
import { openaiLspSuggestCodeActionsPractice } from "./openai.js";

export * from "./core.js";

export type LspSuggestCodeActionsBestPracticeRequest = LspSuggestCodeActionsRequest & {
  preferredProvider?: LspSuggestCodeActionsPracticeProviderName;
};

export const lspSuggestCodeActionsProviderPractices = [
  anthropicLspSuggestCodeActionsPractice,
  openaiLspSuggestCodeActionsPractice,
  deepmindLspSuggestCodeActionsPractice,
] as const;

export const lspSuggestCodeActionsBestPracticeDescriptor = {
  toolId: "code.lsp_suggestCodeActions",
  bestPractice: "anthropic-host-executor-or-shared-stdio-lsp-runtime",
  sourcePriority: ["cli", "agent-sdk", "api-sdk", "praxis-native"],
  providerPractices: lspSuggestCodeActionsProviderPractices,
  dependencies: lspSuggestCodeActionsDependencyDeclarations,
} as const;

function createExecutorProvider(executor: BaseToolExecutorPort | undefined): LspSuggestCodeActionsProvider | undefined {
  const suggestCodeActions = executor?.lsp?.suggestCodeActions;
  if (suggestCodeActions === undefined) {
    return undefined;
  }

  return async (target, context, diagnostics, only) => {
    const result = await suggestCodeActions({
      target,
      diagnostics: diagnostics
        .filter((diagnostic): diagnostic is typeof diagnostic & { range: NonNullable<typeof diagnostic.range> } => diagnostic.range !== undefined)
        .map((diagnostic) => ({
          ...diagnostic,
          range: diagnostic.range,
        })),
      only,
      context: {
        invocationId: context.invocationId,
        workspaceRoot: context.workspaceRoot,
        auditMetadata: context.auditMetadata,
      },
    });
    if (!result.ok) throw new Error(result.error.message);
    return result.output.actions;
  };
}

export const lspSuggestCodeActionsBaseToolDefinition = createLspBaseToolDefinition<
  LspSuggestCodeActionsBestPracticeRequest,
  LspSuggestCodeActionsOutput
>({
  toolId: "code.lsp_suggestCodeActions",
  title: "Code LSP Suggest Code Actions",
  description: "Suggest available code actions through a governed LSP provider.",
  summary: "Use code.lsp_suggestCodeActions when the agent needs fix-it or refactor suggestions without applying edits.",
  permissionHints: ["workspace:read", "lsp:read"],
  dependencies: normalizeLspDependencyDeclarations(lspSuggestCodeActionsDependencyDeclarations),
  inputSchema: jsonSchema("code.lsp_suggestCodeActions.input", {
    type: "object",
    additionalProperties: true,
    required: ["target"],
    properties: {
      target: {
        type: "object",
        additionalProperties: false,
        required: ["filePath", "range"],
        properties: {
          filePath: { type: "string", minLength: 1 },
          range: lspCommonSchemaFragments.lspRange,
          languageId: { type: "string" },
        },
      },
      only: { type: "array", items: { type: "string" } },
      diagnostics: { type: "array", items: { type: "object", additionalProperties: true } },
      context: lspCommonSchemaFragments.invocationContext,
      preferredProvider: { type: "string", enum: ["anthropic", "openai", "deepmind", "praxis-native"] },
    },
  }),
  outputSchema: jsonSchema("code.lsp_suggestCodeActions.output", {
    type: "object",
    additionalProperties: true,
    required: ["kind", "target", "actions", "dryRun", "providerCalled"],
    properties: {
      kind: { const: "agentCore.basicTool.lsp.suggestCodeActions" },
      target: { type: "object", additionalProperties: true },
      actions: { type: "array", items: { type: "object", additionalProperties: true } },
      dryRun: { type: "boolean" },
      providerCalled: { type: "boolean" },
    },
  }),
});

export const lspSuggestCodeActionsHandler: BaseToolHandler<
  LspSuggestCodeActionsBestPracticeRequest,
  LspSuggestCodeActionsOutput
> = createLspCoreHandler(lspSuggestCodeActionsBaseToolDefinition, async (request) => {
  const selection = preferAnthropicExecutor(
    request.executor,
    (executor) => executor.lsp?.suggestCodeActions !== undefined,
    lspSuggestCodeActionsProviderPractices,
    request.input.preferredProvider,
  );

  return await suggestLspCodeActionsCore({
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
