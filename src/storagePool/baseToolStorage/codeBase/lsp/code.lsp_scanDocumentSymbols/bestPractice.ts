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
  scanLspDocumentSymbols as scanLspDocumentSymbolsCore,
  type LspScanDocumentSymbolsOutput,
  type LspScanDocumentSymbolsProvider,
  type LspScanDocumentSymbolsRequest,
} from "./core.js";
import { anthropicLspScanDocumentSymbolsPractice } from "./anthropic.js";
import { lspScanDocumentSymbolsDependencyDeclarations, type LspScanDocumentSymbolsPracticeProviderName } from "./dependencies.js";
import { deepmindLspScanDocumentSymbolsPractice } from "./deepmind.js";
import { openaiLspScanDocumentSymbolsPractice } from "./openai.js";

export * from "./core.js";

export type LspScanDocumentSymbolsBestPracticeRequest = LspScanDocumentSymbolsRequest & {
  preferredProvider?: LspScanDocumentSymbolsPracticeProviderName;
};

export const lspScanDocumentSymbolsProviderPractices = [
  anthropicLspScanDocumentSymbolsPractice,
  openaiLspScanDocumentSymbolsPractice,
  deepmindLspScanDocumentSymbolsPractice,
] as const;

export const lspScanDocumentSymbolsBestPracticeDescriptor = {
  toolId: "code.lsp_scanDocumentSymbols",
  bestPractice: "anthropic-host-executor-or-shared-stdio-lsp-runtime",
  sourcePriority: ["cli", "agent-sdk", "api-sdk", "praxis-native"],
  providerPractices: lspScanDocumentSymbolsProviderPractices,
  dependencies: lspScanDocumentSymbolsDependencyDeclarations,
} as const;

function createExecutorProvider(executor: BaseToolExecutorPort | undefined): LspScanDocumentSymbolsProvider | undefined {
  const scanDocumentSymbols = executor?.lsp?.scanDocumentSymbols;
  if (scanDocumentSymbols === undefined) {
    return undefined;
  }

  return async (target, context) => {
    const result = await scanDocumentSymbols({
      target,
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

export const lspScanDocumentSymbolsBaseToolDefinition = createLspBaseToolDefinition<
  LspScanDocumentSymbolsBestPracticeRequest,
  LspScanDocumentSymbolsOutput
>({
  toolId: "code.lsp_scanDocumentSymbols",
  title: "Code LSP Scan Document Symbols",
  description: "Scan document symbols through a governed LSP provider.",
  summary: "Use code.lsp_scanDocumentSymbols when the agent needs the semantic symbol tree of a file.",
  permissionHints: ["workspace:read", "lsp:read"],
  dependencies: normalizeLspDependencyDeclarations(lspScanDocumentSymbolsDependencyDeclarations),
  inputSchema: jsonSchema("code.lsp_scanDocumentSymbols.input", {
    type: "object",
    additionalProperties: true,
    required: ["target"],
    properties: {
      target: {
        type: "object",
        additionalProperties: false,
        required: ["filePath"],
        properties: {
          filePath: { type: "string", minLength: 1 },
          languageId: { type: "string" },
        },
      },
      context: lspCommonSchemaFragments.invocationContext,
      preferredProvider: { type: "string", enum: ["anthropic", "openai", "deepmind", "praxis-native"] },
    },
  }),
  outputSchema: jsonSchema("code.lsp_scanDocumentSymbols.output", {
    type: "object",
    additionalProperties: true,
    required: ["kind", "target", "symbols", "dryRun", "providerCalled"],
    properties: {
      kind: { const: "agentCore.basicTool.lsp.scanDocumentSymbols" },
      target: { type: "object", additionalProperties: false, required: ["filePath"], properties: { filePath: { type: "string" }, languageId: { type: "string" } } },
      symbols: { type: "array", items: { type: "object", additionalProperties: true } },
      dryRun: { type: "boolean" },
      providerCalled: { type: "boolean" },
    },
  }),
});

export const lspScanDocumentSymbolsHandler: BaseToolHandler<
  LspScanDocumentSymbolsBestPracticeRequest,
  LspScanDocumentSymbolsOutput
> = createLspCoreHandler(lspScanDocumentSymbolsBaseToolDefinition, async (request) => {
  const selection = preferAnthropicExecutor(
    request.executor,
    (executor) => executor.lsp?.scanDocumentSymbols !== undefined,
    lspScanDocumentSymbolsProviderPractices,
    request.input.preferredProvider,
  );

  return await scanLspDocumentSymbolsCore({
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
