import type { BaseToolHandler } from "../../../../../agentCore/agent_executionEngine/basic_toolLayer/baseTools/baseToolDefinition.js";
import { baseToolInvokeFailure, baseToolInvokeSuccess, buildPracticeAuditMetadata, createLspBaseToolDefinition, jsonSchema, normalizeDocumentUriToFilePath, normalizeLspDependencyDeclarations, preferAnthropicExecutor } from "../_shared/baseToolAdapter.js";
import { createLspFormatRangePlan as createLspFormatRangePlanCore, type LspFormatRangeRequest } from "./core.js";
import { formatRangeWithLspRuntime, type LspLocateDefinitionRuntimeOptions, type LspRuntimeTextEdit } from "../_shared/runtime.js";
import { anthropicLspFormatRangePractice } from "./anthropic.js";
import { lspFormatRangeDependencyDeclarations, type LspFormatRangePracticeProviderName } from "./dependencies.js";
import { deepmindLspFormatRangePractice } from "./deepmind.js";
import { openaiLspFormatRangePractice } from "./openai.js";

export * from "./core.js";

export type LspFormatRangeRuntimeOutput = {
  kind: "agentCore.basicTool.lsp.formatRange";
  target: { filePath: string; languageId?: string; range: NonNullable<LspFormatRangeRequest["range"]> };
  edits: readonly LspRuntimeTextEdit[];
  dryRun: boolean;
  providerCalled: boolean;
  appliesChanges: false;
  permissionsRequired: readonly ["workspace:read", "workspace:edit", "lsp:read"];
  unsafeSideEffects: false;
};

export type LspFormatRangePreviewOutput = {
  kind: "agentCore.basicTool.lsp.formatRange.preview";
  preview: ReturnType<typeof createLspFormatRangePlanCore> extends infer Result
    ? Result extends { ok: true; plan: infer Plan }
      ? Plan
      : never
    : never;
  dryRun: true;
  providerCalled: false;
  unsafeSideEffects: false;
};

export type LspFormatRangeBestPracticeOutput = LspFormatRangeRuntimeOutput | LspFormatRangePreviewOutput;

export type LspFormatRangeBestPracticeRequest = LspFormatRangeRequest & {
  runtime?: LspLocateDefinitionRuntimeOptions;
  preferredProvider?: LspFormatRangePracticeProviderName;
};

export const lspFormatRangeProviderPractices = [
  anthropicLspFormatRangePractice,
  openaiLspFormatRangePractice,
  deepmindLspFormatRangePractice,
] as const;

export const lspFormatRangeBestPracticeDescriptor = {
  toolId: "code.lsp_formatRange",
  bestPractice: "anthropic-host-executor-or-shared-stdio-lsp-runtime-preview-only",
  sourcePriority: ["cli", "agent-sdk", "api-sdk", "praxis-native"],
  providerPractices: lspFormatRangeProviderPractices,
  dependencies: lspFormatRangeDependencyDeclarations,
} as const;

function normalizeTarget(request: LspFormatRangeBestPracticeRequest) {
  if (request.documentUri?.trim().length !== 0 && request.range !== undefined) {
    return {
      filePath: normalizeDocumentUriToFilePath(request.documentUri ?? "", request.runtime?.workspaceRoot),
      languageId: request.languageId ?? request.runtime?.workspaceLanguageId,
      range: request.range,
    };
  }
  return undefined;
}

export const lspFormatRangeBaseToolDefinition = createLspBaseToolDefinition<
  LspFormatRangeBestPracticeRequest,
  LspFormatRangeBestPracticeOutput
>({
  toolId: "code.lsp_formatRange",
  title: "Code LSP Format Range",
  description: "Preview range formatting edits through a governed LSP provider.",
  summary: "Use code.lsp_formatRange when the agent needs LSP formatting edits for a specific range without applying them.",
  riskLevel: "risky",
  permissionHints: ["workspace:read", "workspace:edit", "lsp:read"],
  dependencies: normalizeLspDependencyDeclarations(lspFormatRangeDependencyDeclarations),
  inputSchema: jsonSchema("code.lsp_formatRange.input", {
    type: "object",
    additionalProperties: true,
    required: ["documentUri", "range"],
    properties: {
      documentUri: { type: "string", minLength: 1 },
      range: { type: "object", additionalProperties: true },
      options: { type: "object", additionalProperties: true },
      runtime: { type: "object", additionalProperties: true },
      preferredProvider: { type: "string", enum: ["anthropic", "openai", "deepmind", "praxis-native"] },
    },
  }),
  outputSchema: jsonSchema("code.lsp_formatRange.output", {
    type: "object",
    additionalProperties: true,
    required: ["kind", "dryRun", "providerCalled"],
    properties: {
      kind: { type: "string", enum: ["agentCore.basicTool.lsp.formatRange", "agentCore.basicTool.lsp.formatRange.preview"] },
      dryRun: { type: "boolean" },
      providerCalled: { type: "boolean" },
    },
  }),
});

export const lspFormatRangeHandler: BaseToolHandler<
  LspFormatRangeBestPracticeRequest,
  LspFormatRangeBestPracticeOutput
> = {
  definition: lspFormatRangeBaseToolDefinition,
  async invoke(request) {
    const selection = preferAnthropicExecutor(
      request.executor,
      (executor) => executor.lsp?.formatRangePreview !== undefined,
      lspFormatRangeProviderPractices,
      request.input.preferredProvider,
    );

    if (request.input.dryRun !== false) {
      const preview = createLspFormatRangePlanCore({
        ...request.input,
        runtimeId: request.runtimeId,
        sessionId: request.sessionId,
        invocationId: request.toolCallId,
        dryRun: true,
      });
      if (!preview.ok) return baseToolInvokeFailure("code.lsp_formatRange", preview.error.code, preview.error.message, preview.events);
      return baseToolInvokeSuccess(
        "code.lsp_formatRange",
        { kind: "agentCore.basicTool.lsp.formatRange.preview", preview: preview.plan, dryRun: true, providerCalled: false, unsafeSideEffects: false },
        preview.events,
        { audit: buildPracticeAuditMetadata(selection) },
      );
    }

    const target = normalizeTarget(request.input);
    if (target === undefined) return baseToolInvokeFailure("code.lsp_formatRange", "MISSING_DOCUMENT_URI", "LSP format range requires documentUri and range", ["basicTool.lsp.formatRange.rejected"]);

    try {
      const executorFormatRange = request.executor.lsp?.formatRangePreview;
      const edits =
        executorFormatRange !== undefined && selection.providerName === "anthropic"
          ? await (async () => {
              const result = await executorFormatRange({
                target,
                options: request.input.options,
                context: { invocationId: request.toolCallId, workspaceRoot: request.input.runtime?.workspaceRoot },
              });
              if (!result.ok) throw new Error(result.error.message);
              return result.output.edits;
            })()
          : await formatRangeWithLspRuntime(target, target.range, { tabSize: request.input.options?.tabSize ?? 2, insertSpaces: request.input.options?.insertSpaces ?? true }, request.input.runtime);

      return baseToolInvokeSuccess(
        "code.lsp_formatRange",
        { kind: "agentCore.basicTool.lsp.formatRange", target, edits, dryRun: false, providerCalled: true, appliesChanges: false, permissionsRequired: ["workspace:read", "workspace:edit", "lsp:read"], unsafeSideEffects: false },
        ["basicTool.lsp.formatRange.providerCalled"],
        { audit: buildPracticeAuditMetadata(selection) },
      );
    } catch (error) {
      return baseToolInvokeFailure("code.lsp_formatRange", "PROVIDER_REJECTED", error instanceof Error ? error.message : "LSP format range provider rejected the invocation", ["basicTool.lsp.formatRange.rejected"]);
    }
  },
};
