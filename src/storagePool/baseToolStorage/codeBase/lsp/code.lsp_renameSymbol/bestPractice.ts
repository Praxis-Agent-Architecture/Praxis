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
  renameLspSymbol as renameLspSymbolCore,
  type LspRenameSymbolOutput,
  type LspRenameSymbolProvider,
  type LspRenameSymbolRequest,
} from "./core.js";
import { anthropicLspRenameSymbolPractice } from "./anthropic.js";
import { lspRenameSymbolDependencyDeclarations, type LspRenameSymbolPracticeProviderName } from "./dependencies.js";
import { deepmindLspRenameSymbolPractice } from "./deepmind.js";
import { openaiLspRenameSymbolPractice } from "./openai.js";

export * from "./core.js";

export type LspRenameSymbolBestPracticeRequest = LspRenameSymbolRequest & {
  preferredProvider?: LspRenameSymbolPracticeProviderName;
};

export const lspRenameSymbolProviderPractices = [
  anthropicLspRenameSymbolPractice,
  openaiLspRenameSymbolPractice,
  deepmindLspRenameSymbolPractice,
] as const;

export const lspRenameSymbolBestPracticeDescriptor = {
  toolId: "code.lsp_renameSymbol",
  bestPractice: "anthropic-host-executor-or-shared-stdio-lsp-runtime-preview-only",
  sourcePriority: ["cli", "agent-sdk", "api-sdk", "praxis-native"],
  providerPractices: lspRenameSymbolProviderPractices,
  dependencies: lspRenameSymbolDependencyDeclarations,
} as const;

function createExecutorProvider(executor: BaseToolExecutorPort | undefined): LspRenameSymbolProvider | undefined {
  const renameSymbolPreview = executor?.lsp?.renameSymbolPreview;
  if (renameSymbolPreview === undefined) {
    return undefined;
  }

  return async (target, newName, context) => {
    const result = await renameSymbolPreview({
      target,
      newName,
      context: {
        invocationId: context.invocationId,
        workspaceRoot: context.workspaceRoot,
        auditMetadata: context.auditMetadata,
      },
    });
    if (!result.ok) throw new Error(result.error.message);
    return {
      source: "provider",
      changes: result.output.edits.flatMap((file) =>
        file.edits.map((edit) => ({
          filePath: file.filePath,
          range: edit.range,
          newText: edit.newText,
        })),
      ),
    };
  };
}

export const lspRenameSymbolBaseToolDefinition = createLspBaseToolDefinition<
  LspRenameSymbolBestPracticeRequest,
  LspRenameSymbolOutput
>({
  toolId: "code.lsp_renameSymbol",
  title: "Code LSP Rename Symbol",
  description: "Preview symbol rename edits through a governed LSP provider.",
  summary: "Use code.lsp_renameSymbol when the agent needs an auditable workspace-edit preview for a rename.",
  riskLevel: "risky",
  permissionHints: ["workspace:read", "lsp:read", "workspace:edit"],
  dependencies: normalizeLspDependencyDeclarations(lspRenameSymbolDependencyDeclarations),
  inputSchema: jsonSchema("code.lsp_renameSymbol.input", {
    type: "object",
    additionalProperties: true,
    required: ["target", "newName"],
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
      newName: { type: "string", minLength: 1 },
      context: lspCommonSchemaFragments.invocationContext,
      preferredProvider: { type: "string", enum: ["anthropic", "openai", "deepmind", "praxis-native"] },
    },
  }),
  outputSchema: jsonSchema("code.lsp_renameSymbol.output", {
    type: "object",
    additionalProperties: true,
    required: ["kind", "target", "newName", "workspaceEdit", "dryRun", "providerCalled"],
    properties: {
      kind: { const: "agentCore.basicTool.lsp.renameSymbol" },
      target: { type: "object", additionalProperties: true },
      newName: { type: "string" },
      workspaceEdit: { type: "object", additionalProperties: true },
      dryRun: { type: "boolean" },
      providerCalled: { type: "boolean" },
    },
  }),
});

export const lspRenameSymbolHandler: BaseToolHandler<
  LspRenameSymbolBestPracticeRequest,
  LspRenameSymbolOutput
> = createLspCoreHandler(lspRenameSymbolBaseToolDefinition, async (request) => {
  const selection = preferAnthropicExecutor(
    request.executor,
    (executor) => executor.lsp?.renameSymbolPreview !== undefined,
    lspRenameSymbolProviderPractices,
    request.input.preferredProvider,
  );

  return await renameLspSymbolCore({
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
