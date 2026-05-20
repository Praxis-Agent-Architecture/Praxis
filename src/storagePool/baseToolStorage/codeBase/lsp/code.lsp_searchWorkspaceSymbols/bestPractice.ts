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
  searchLspWorkspaceSymbols as searchLspWorkspaceSymbolsCore,
  type LspSearchWorkspaceSymbolsOutput,
  type LspSearchWorkspaceSymbolsProvider,
  type LspSearchWorkspaceSymbolsRequest,
} from "./core.js";
import { anthropicLspSearchWorkspaceSymbolsPractice } from "./anthropic.js";
import { lspSearchWorkspaceSymbolsDependencyDeclarations, type LspSearchWorkspaceSymbolsPracticeProviderName } from "./dependencies.js";
import { deepmindLspSearchWorkspaceSymbolsPractice } from "./deepmind.js";
import { openaiLspSearchWorkspaceSymbolsPractice } from "./openai.js";

export * from "./core.js";

export type LspSearchWorkspaceSymbolsBestPracticeRequest = LspSearchWorkspaceSymbolsRequest & {
  preferredProvider?: LspSearchWorkspaceSymbolsPracticeProviderName;
};

export const lspSearchWorkspaceSymbolsProviderPractices = [
  anthropicLspSearchWorkspaceSymbolsPractice,
  openaiLspSearchWorkspaceSymbolsPractice,
  deepmindLspSearchWorkspaceSymbolsPractice,
] as const;

export const lspSearchWorkspaceSymbolsBestPracticeDescriptor = {
  toolId: "code.lsp_searchWorkspaceSymbols",
  bestPractice: "anthropic-host-executor-or-shared-stdio-lsp-runtime",
  sourcePriority: ["cli", "agent-sdk", "api-sdk", "praxis-native"],
  providerPractices: lspSearchWorkspaceSymbolsProviderPractices,
  dependencies: lspSearchWorkspaceSymbolsDependencyDeclarations,
} as const;

function createExecutorProvider(executor: BaseToolExecutorPort | undefined): LspSearchWorkspaceSymbolsProvider | undefined {
  const searchWorkspaceSymbols = executor?.lsp?.searchWorkspaceSymbols;
  if (searchWorkspaceSymbols === undefined) {
    return undefined;
  }

  return async (query, context, limit) => {
    const result = await searchWorkspaceSymbols({
      query,
      limit,
      workspaceRoot: context.workspaceRoot,
      context: {
        invocationId: context.invocationId,
        workspaceRoot: context.workspaceRoot,
        auditMetadata: context.auditMetadata,
      },
    });
    if (!result.ok) throw new Error(result.error.message);
    return result.output.symbols;
  };
}

export const lspSearchWorkspaceSymbolsBaseToolDefinition = createLspBaseToolDefinition<
  LspSearchWorkspaceSymbolsBestPracticeRequest,
  LspSearchWorkspaceSymbolsOutput
>({
  toolId: "code.lsp_searchWorkspaceSymbols",
  title: "Code LSP Search Workspace Symbols",
  description: "Search workspace symbols through a governed LSP provider.",
  summary: "Use code.lsp_searchWorkspaceSymbols when the agent needs fuzzy or exact symbol lookup at workspace scope.",
  permissionHints: ["workspace:read", "lsp:read"],
  dependencies: normalizeLspDependencyDeclarations(lspSearchWorkspaceSymbolsDependencyDeclarations),
  inputSchema: jsonSchema("code.lsp_searchWorkspaceSymbols.input", {
    type: "object",
    additionalProperties: true,
    required: ["query"],
    properties: {
      query: { type: "string", minLength: 1 },
      limit: { type: "integer", minimum: 1, maximum: 200 },
      context: lspCommonSchemaFragments.invocationContext,
      runtime: {
        type: "object",
        additionalProperties: true,
        properties: {
          workspaceLanguageId: { type: "string" },
          workspaceFilePathHint: { type: "string" },
        },
      },
      preferredProvider: { type: "string", enum: ["anthropic", "openai", "deepmind", "praxis-native"] },
    },
  }),
  outputSchema: jsonSchema("code.lsp_searchWorkspaceSymbols.output", {
    type: "object",
    additionalProperties: true,
    required: ["kind", "query", "symbols", "limit", "dryRun", "providerCalled"],
    properties: {
      kind: { const: "agentCore.basicTool.lsp.searchWorkspaceSymbols" },
      query: { type: "string" },
      symbols: { type: "array", items: { type: "object", additionalProperties: true } },
      limit: { type: "integer", minimum: 1 },
      dryRun: { type: "boolean" },
      providerCalled: { type: "boolean" },
    },
  }),
});

export const lspSearchWorkspaceSymbolsHandler: BaseToolHandler<
  LspSearchWorkspaceSymbolsBestPracticeRequest,
  LspSearchWorkspaceSymbolsOutput
> = createLspCoreHandler(lspSearchWorkspaceSymbolsBaseToolDefinition, async (request) => {
  const selection = preferAnthropicExecutor(
    request.executor,
    (executor) => executor.lsp?.searchWorkspaceSymbols !== undefined,
    lspSearchWorkspaceSymbolsProviderPractices,
    request.input.preferredProvider,
  );

  return await searchLspWorkspaceSymbolsCore({
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
