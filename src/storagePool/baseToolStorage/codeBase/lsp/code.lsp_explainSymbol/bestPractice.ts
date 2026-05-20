import type { BaseToolHandler } from "../../../../../agentCore_executionEngine/basic_toolLayer/baseTools/baseToolDefinition.js";
import { baseToolInvokeFailure, baseToolInvokeSuccess, buildPracticeAuditMetadata, createLspBaseToolDefinition, jsonSchema, lspCommonSchemaFragments, normalizeDocumentUriToFilePath, normalizeLspDependencyDeclarations, preferAnthropicExecutor } from "../_shared/baseToolAdapter.js";
import { planLspSymbolExplanation as planLspSymbolExplanationCore, type LspExplainSymbolRequest } from "./core.js";
import { hoverWithLspRuntime, locateDefinitionWithLspRuntime, traceReferencesWithLspRuntime, type LspLocateDefinitionRuntimeOptions, type LspRuntimeHover } from "../_shared/runtime.js";
import type { LspLocation } from "../code.lsp_locateDefinition/core.js";
import { anthropicLspExplainSymbolPractice } from "./anthropic.js";
import { lspExplainSymbolDependencyDeclarations, type LspExplainSymbolPracticeProviderName } from "./dependencies.js";
import { deepmindLspExplainSymbolPractice } from "./deepmind.js";
import { openaiLspExplainSymbolPractice } from "./openai.js";

export * from "./core.js";

export type LspExplainSymbolRuntimeOutput = {
  kind: "agentCore.basicTool.lsp.explainSymbol";
  target: { filePath: string; line: number; character: number; languageId?: string };
  hover?: LspRuntimeHover;
  definitions: readonly LspLocation[];
  references: readonly LspLocation[];
  dryRun: boolean;
  providerCalled: boolean;
  permissionsRequired: readonly ["workspace:read", "lsp:read"];
  unsafeSideEffects: false;
};

export type LspExplainSymbolPreviewOutput = {
  kind: "agentCore.basicTool.lsp.explainSymbol.preview";
  preview: ReturnType<typeof planLspSymbolExplanationCore> extends infer Result
    ? Result extends { ok: true; plan: infer Plan }
      ? Plan
      : never
    : never;
  dryRun: true;
  providerCalled: false;
  unsafeSideEffects: false;
};

export type LspExplainSymbolBestPracticeOutput = LspExplainSymbolRuntimeOutput | LspExplainSymbolPreviewOutput;

export type LspExplainSymbolBestPracticeRequest = LspExplainSymbolRequest & {
  runtime?: LspLocateDefinitionRuntimeOptions;
  preferredProvider?: LspExplainSymbolPracticeProviderName;
};

export const lspExplainSymbolProviderPractices = [
  anthropicLspExplainSymbolPractice,
  openaiLspExplainSymbolPractice,
  deepmindLspExplainSymbolPractice,
] as const;

export const lspExplainSymbolBestPracticeDescriptor = {
  toolId: "code.lsp_explainSymbol",
  bestPractice: "anthropic-host-executor-or-shared-stdio-lsp-runtime",
  sourcePriority: ["cli", "agent-sdk", "api-sdk", "praxis-native"],
  providerPractices: lspExplainSymbolProviderPractices,
  dependencies: lspExplainSymbolDependencyDeclarations,
} as const;

function normalizeTarget(request: LspExplainSymbolBestPracticeRequest) {
  if (request.documentUri?.trim().length !== 0 && request.position !== undefined) {
    return {
      filePath: normalizeDocumentUriToFilePath(request.documentUri ?? "", request.workspaceRoot ?? request.runtime?.workspaceRoot),
      line: request.position.line,
      character: request.position.character,
      languageId: request.runtime?.workspaceLanguageId,
    };
  }
  return undefined;
}

export const lspExplainSymbolBaseToolDefinition = createLspBaseToolDefinition<
  LspExplainSymbolBestPracticeRequest,
  LspExplainSymbolBestPracticeOutput
>({
  toolId: "code.lsp_explainSymbol",
  title: "Code LSP Explain Symbol",
  description: "Resolve hover and symbol context through a governed LSP provider.",
  summary: "Use code.lsp_explainSymbol when the agent needs hover text plus definition or reference hints for a symbol.",
  permissionHints: ["workspace:read", "lsp:read"],
  dependencies: normalizeLspDependencyDeclarations(lspExplainSymbolDependencyDeclarations),
  inputSchema: jsonSchema("code.lsp_explainSymbol.input", {
    type: "object",
    additionalProperties: true,
    required: ["documentUri", "position"],
    properties: {
      documentUri: { type: "string", minLength: 1 },
      position: lspCommonSchemaFragments.lspPosition,
      includeDefinitionHint: { type: "boolean" },
      includeReferencesHint: { type: "boolean" },
      runtime: { type: "object", additionalProperties: true },
      preferredProvider: { type: "string", enum: ["anthropic", "openai", "deepmind", "praxis-native"] },
    },
  }),
  outputSchema: jsonSchema("code.lsp_explainSymbol.output", {
    type: "object",
    additionalProperties: true,
    required: ["kind", "dryRun", "providerCalled"],
    properties: {
      kind: { type: "string", enum: ["agentCore.basicTool.lsp.explainSymbol", "agentCore.basicTool.lsp.explainSymbol.preview"] },
      dryRun: { type: "boolean" },
      providerCalled: { type: "boolean" },
    },
  }),
});

export const lspExplainSymbolHandler: BaseToolHandler<
  LspExplainSymbolBestPracticeRequest,
  LspExplainSymbolBestPracticeOutput
> = {
  definition: lspExplainSymbolBaseToolDefinition,
  async invoke(request) {
    const selection = preferAnthropicExecutor(
      request.executor,
      (executor) => executor.lsp?.explainSymbol !== undefined,
      lspExplainSymbolProviderPractices,
      request.input.preferredProvider,
    );

    if (request.input.dryRun !== false) {
      const preview = planLspSymbolExplanationCore({
        ...request.input,
        runtimeId: request.runtimeId,
        sessionId: request.sessionId,
        workspaceRoot: request.input.workspaceRoot ?? request.input.runtime?.workspaceRoot,
        dryRun: true,
      });
      if (!preview.ok) return baseToolInvokeFailure("code.lsp_explainSymbol", preview.error.code, preview.error.message, preview.events);
      return baseToolInvokeSuccess(
        "code.lsp_explainSymbol",
        { kind: "agentCore.basicTool.lsp.explainSymbol.preview", preview: preview.plan, dryRun: true, providerCalled: false, unsafeSideEffects: false },
        preview.events,
        { audit: buildPracticeAuditMetadata(selection) },
      );
    }

    const target = normalizeTarget(request.input);
    if (target === undefined) {
      return baseToolInvokeFailure("code.lsp_explainSymbol", "MISSING_DOCUMENT_URI", "LSP symbol explanation requires documentUri and position", ["basicTool.lsp.explainSymbol.rejected"]);
    }

    try {
      const executorExplainSymbol = request.executor.lsp?.explainSymbol;
      const result =
        executorExplainSymbol !== undefined && selection.providerName === "anthropic"
          ? await (async () => {
              const invoked = await executorExplainSymbol({
                target,
                includeDefinitionHint: request.input.includeDefinitionHint,
                includeReferencesHint: request.input.includeReferencesHint,
                context: { invocationId: request.toolCallId, workspaceRoot: request.input.workspaceRoot ?? request.input.runtime?.workspaceRoot },
              });
              if (!invoked.ok) throw new Error(invoked.error.message);
              return {
                hover: invoked.output.hover,
                definitions: invoked.output.definitions ?? [],
                references: invoked.output.references ?? [],
              };
            })()
          : {
              hover: await hoverWithLspRuntime(target, {
                ...request.input.runtime,
                workspaceRoot: request.input.runtime?.workspaceRoot ?? request.input.workspaceRoot,
              }),
              definitions:
                request.input.includeDefinitionHint === false
                  ? []
                  : await locateDefinitionWithLspRuntime(target, {
                      ...request.input.runtime,
                      workspaceRoot: request.input.runtime?.workspaceRoot ?? request.input.workspaceRoot,
                    }),
              references:
                request.input.includeReferencesHint === true
                  ? await traceReferencesWithLspRuntime(
                      target,
                      true,
                      {
                        ...request.input.runtime,
                        workspaceRoot: request.input.runtime?.workspaceRoot ?? request.input.workspaceRoot,
                      },
                    )
                  : [],
            };

      return baseToolInvokeSuccess(
        "code.lsp_explainSymbol",
        {
          kind: "agentCore.basicTool.lsp.explainSymbol",
          target,
          hover: result.hover,
          definitions: result.definitions,
          references: result.references,
          dryRun: false,
          providerCalled: true,
          permissionsRequired: ["workspace:read", "lsp:read"],
          unsafeSideEffects: false,
        },
        ["basicTool.lsp.explainSymbol.providerCalled"],
        { audit: buildPracticeAuditMetadata(selection) },
      );
    } catch (error) {
      return baseToolInvokeFailure("code.lsp_explainSymbol", "PROVIDER_REJECTED", "code.lsp_explainSymbol provider rejected the invocation", ["basicTool.lsp.explainSymbol.rejected"]);
    }
  },
};
