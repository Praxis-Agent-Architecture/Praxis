import type { BaseToolHandler } from "../../../../../agentCore/agent_executionEngine/basic_toolLayer/baseTools/baseToolDefinition.js";
import { baseToolInvokeFailure, baseToolInvokeSuccess, buildPracticeAuditMetadata, createLspBaseToolDefinition, jsonSchema, normalizeDocumentUriToFilePath, normalizeLspDependencyDeclarations, preferAnthropicExecutor } from "../_shared/baseToolAdapter.js";
import { createLspFormatDocumentPlan as createLspFormatDocumentPlanCore, type LspFormatDocumentRequest } from "./core.js";
import { formatDocumentWithLspRuntime, type LspLocateDefinitionRuntimeOptions, type LspRuntimeTextEdit } from "../_shared/runtime.js";
import { anthropicLspFormatDocumentPractice } from "./anthropic.js";
import { lspFormatDocumentDependencyDeclarations, type LspFormatDocumentPracticeProviderName } from "./dependencies.js";
import { deepmindLspFormatDocumentPractice } from "./deepmind.js";
import { openaiLspFormatDocumentPractice } from "./openai.js";

export * from "./core.js";

export type LspFormatDocumentRuntimeOutput = {
  kind: "agentCore.basicTool.lsp.formatDocument";
  target: { filePath: string; languageId?: string };
  edits: readonly LspRuntimeTextEdit[];
  dryRun: boolean;
  providerCalled: boolean;
  appliesChanges: false;
  permissionsRequired: readonly ["workspace:read", "workspace:edit", "lsp:read"];
  unsafeSideEffects: false;
};

export type LspFormatDocumentPreviewOutput = {
  kind: "agentCore.basicTool.lsp.formatDocument.preview";
  preview: ReturnType<typeof createLspFormatDocumentPlanCore> extends infer Result
    ? Result extends { ok: true; plan: infer Plan }
      ? Plan
      : never
    : never;
  dryRun: true;
  providerCalled: false;
  unsafeSideEffects: false;
};

export type LspFormatDocumentBestPracticeOutput = LspFormatDocumentRuntimeOutput | LspFormatDocumentPreviewOutput;

export type LspFormatDocumentBestPracticeRequest = LspFormatDocumentRequest & {
  runtime?: LspLocateDefinitionRuntimeOptions;
  preferredProvider?: LspFormatDocumentPracticeProviderName;
};

export const lspFormatDocumentProviderPractices = [
  anthropicLspFormatDocumentPractice,
  openaiLspFormatDocumentPractice,
  deepmindLspFormatDocumentPractice,
] as const;

export const lspFormatDocumentBestPracticeDescriptor = {
  toolId: "code.lsp_formatDocument",
  bestPractice: "anthropic-host-executor-or-shared-stdio-lsp-runtime-preview-only",
  sourcePriority: ["cli", "agent-sdk", "api-sdk", "praxis-native"],
  providerPractices: lspFormatDocumentProviderPractices,
  dependencies: lspFormatDocumentDependencyDeclarations,
} as const;

function normalizeTarget(request: LspFormatDocumentBestPracticeRequest) {
  if (request.documentUri?.trim().length !== 0) {
    return {
      filePath: normalizeDocumentUriToFilePath(request.documentUri ?? "", request.runtime?.workspaceRoot),
      languageId: request.languageId ?? request.runtime?.workspaceLanguageId,
    };
  }
  return undefined;
}

export const lspFormatDocumentBaseToolDefinition = createLspBaseToolDefinition<
  LspFormatDocumentBestPracticeRequest,
  LspFormatDocumentBestPracticeOutput
>({
  toolId: "code.lsp_formatDocument",
  title: "Code LSP Format Document",
  description: "Preview whole-document formatting edits through a governed LSP provider.",
  summary: "Use code.lsp_formatDocument when the agent needs LSP formatting edits for an entire file without writing them back directly.",
  riskLevel: "risky",
  permissionHints: ["workspace:read", "workspace:edit", "lsp:read"],
  dependencies: normalizeLspDependencyDeclarations(lspFormatDocumentDependencyDeclarations),
  inputSchema: jsonSchema("code.lsp_formatDocument.input", {
    type: "object",
    additionalProperties: true,
    required: ["documentUri"],
    properties: {
      documentUri: { type: "string", minLength: 1 },
      languageId: { type: "string" },
      options: { type: "object", additionalProperties: true },
      runtime: { type: "object", additionalProperties: true },
      preferredProvider: { type: "string", enum: ["anthropic", "openai", "deepmind", "praxis-native"] },
    },
  }),
  outputSchema: jsonSchema("code.lsp_formatDocument.output", {
    type: "object",
    additionalProperties: true,
    required: ["kind", "dryRun", "providerCalled"],
    properties: {
      kind: { type: "string", enum: ["agentCore.basicTool.lsp.formatDocument", "agentCore.basicTool.lsp.formatDocument.preview"] },
      dryRun: { type: "boolean" },
      providerCalled: { type: "boolean" },
    },
  }),
});

export const lspFormatDocumentHandler: BaseToolHandler<
  LspFormatDocumentBestPracticeRequest,
  LspFormatDocumentBestPracticeOutput
> = {
  definition: lspFormatDocumentBaseToolDefinition,
  async invoke(request) {
    const selection = preferAnthropicExecutor(
      request.executor,
      (executor) => executor.lsp?.formatDocumentPreview !== undefined,
      lspFormatDocumentProviderPractices,
      request.input.preferredProvider,
    );

    if (request.input.dryRun !== false) {
      const preview = createLspFormatDocumentPlanCore({
        ...request.input,
        runtimeId: request.runtimeId,
        sessionId: request.sessionId,
        invocationId: request.toolCallId,
        dryRun: true,
      });
      if (!preview.ok) return baseToolInvokeFailure("code.lsp_formatDocument", preview.error.code, preview.error.message, preview.events);
      return baseToolInvokeSuccess(
        "code.lsp_formatDocument",
        { kind: "agentCore.basicTool.lsp.formatDocument.preview", preview: preview.plan, dryRun: true, providerCalled: false, unsafeSideEffects: false },
        preview.events,
        { audit: buildPracticeAuditMetadata(selection) },
      );
    }

    const target = normalizeTarget(request.input);
    if (target === undefined) return baseToolInvokeFailure("code.lsp_formatDocument", "MISSING_DOCUMENT_URI", "LSP format document requires documentUri", ["basicTool.lsp.formatDocument.rejected"]);

    try {
      const executorFormatDocument = request.executor.lsp?.formatDocumentPreview;
      const edits =
        executorFormatDocument !== undefined && selection.providerName === "anthropic"
          ? await (async () => {
              const result = await executorFormatDocument({
                target,
                options: request.input.options,
                context: { invocationId: request.toolCallId, workspaceRoot: request.input.runtime?.workspaceRoot },
              });
              if (!result.ok) throw new Error(result.error.message);
              return result.output.edits;
            })()
          : await formatDocumentWithLspRuntime(target, { tabSize: request.input.options?.tabSize ?? 2, insertSpaces: request.input.options?.insertSpaces ?? true }, request.input.runtime);

      return baseToolInvokeSuccess(
        "code.lsp_formatDocument",
        { kind: "agentCore.basicTool.lsp.formatDocument", target, edits, dryRun: false, providerCalled: true, appliesChanges: false, permissionsRequired: ["workspace:read", "workspace:edit", "lsp:read"], unsafeSideEffects: false },
        ["basicTool.lsp.formatDocument.providerCalled"],
        { audit: buildPracticeAuditMetadata(selection) },
      );
    } catch (error) {
      return baseToolInvokeFailure("code.lsp_formatDocument", "PROVIDER_REJECTED", error instanceof Error ? error.message : "LSP format document provider rejected the invocation", ["basicTool.lsp.formatDocument.rejected"]);
    }
  },
};
