import type { BaseToolHandler } from "../../../../../agentCore_executionEngine/basic_toolLayer/baseTools/baseToolDefinition.js";
import { baseToolInvokeFailure, baseToolInvokeSuccess, buildPracticeAuditMetadata, createLspBaseToolDefinition, jsonSchema, lspCommonSchemaFragments, normalizeDocumentUriToFilePath, normalizeLspDependencyDeclarations, preferAnthropicExecutor } from "../_shared/baseToolAdapter.js";
import { planLspApplyCodeAction as planLspApplyCodeActionCore, type LspApplyCodeActionRequest } from "./core.js";
import { codeActionsWithLspRuntime, type LspLocateDefinitionRuntimeOptions, type LspRuntimeCodeAction } from "../_shared/runtime.js";
import { anthropicLspApplyCodeActionPractice } from "./anthropic.js";
import { lspApplyCodeActionDependencyDeclarations, type LspApplyCodeActionPracticeProviderName } from "./dependencies.js";
import { deepmindLspApplyCodeActionPractice } from "./deepmind.js";
import { openaiLspApplyCodeActionPractice } from "./openai.js";

export * from "./core.js";

export type LspApplyCodeActionRuntimeOutput = {
  kind: "agentCore.basicTool.lsp.applyCodeAction";
  target: { filePath: string; range?: unknown; languageId?: string };
  matchingActions: readonly LspRuntimeCodeAction[];
  dryRun: boolean;
  providerCalled: boolean;
  appliesChanges: false;
  permissionsRequired: readonly ["workspace:read", "workspace:edit", "lsp:read"];
  unsafeSideEffects: false;
};

export type LspApplyCodeActionPreviewOutput = {
  kind: "agentCore.basicTool.lsp.applyCodeAction.preview";
  preview: ReturnType<typeof planLspApplyCodeActionCore> extends infer Result
    ? Result extends { ok: true; plan: infer Plan }
      ? Plan
      : never
    : never;
  dryRun: true;
  providerCalled: false;
  unsafeSideEffects: false;
};

export type LspApplyCodeActionBestPracticeOutput = LspApplyCodeActionRuntimeOutput | LspApplyCodeActionPreviewOutput;

export type LspApplyCodeActionBestPracticeRequest = LspApplyCodeActionRequest & {
  runtime?: LspLocateDefinitionRuntimeOptions;
  preferredProvider?: LspApplyCodeActionPracticeProviderName;
};

export const lspApplyCodeActionProviderPractices = [
  anthropicLspApplyCodeActionPractice,
  openaiLspApplyCodeActionPractice,
  deepmindLspApplyCodeActionPractice,
] as const;

export const lspApplyCodeActionBestPracticeDescriptor = {
  toolId: "code.lsp_applyCodeAction",
  bestPractice: "anthropic-host-executor-or-shared-stdio-lsp-runtime-preview-only",
  sourcePriority: ["cli", "agent-sdk", "api-sdk", "praxis-native"],
  providerPractices: lspApplyCodeActionProviderPractices,
  dependencies: lspApplyCodeActionDependencyDeclarations,
} as const;

function normalizeTarget(request: LspApplyCodeActionBestPracticeRequest) {
  if (request.documentUri?.trim().length !== 0) {
    return {
      filePath: normalizeDocumentUriToFilePath(request.documentUri ?? "", request.workspaceRoot ?? request.runtime?.workspaceRoot),
      range: undefined,
      languageId: request.runtime?.workspaceLanguageId,
    };
  }
  return undefined;
}

export const lspApplyCodeActionBaseToolDefinition = createLspBaseToolDefinition<
  LspApplyCodeActionBestPracticeRequest,
  LspApplyCodeActionBestPracticeOutput
>({
  toolId: "code.lsp_applyCodeAction",
  title: "Code LSP Apply Code Action",
  description: "Preview matching code actions through a governed LSP provider without applying edits.",
  summary: "Use code.lsp_applyCodeAction when the agent needs the exact action payload that would be applied, but not the mutation itself.",
  riskLevel: "risky",
  permissionHints: ["workspace:read", "workspace:edit", "lsp:read"],
  dependencies: normalizeLspDependencyDeclarations(lspApplyCodeActionDependencyDeclarations),
  inputSchema: jsonSchema("code.lsp_applyCodeAction.input", {
    type: "object",
    additionalProperties: true,
    required: ["documentUri"],
    properties: {
      documentUri: { type: "string", minLength: 1 },
      actionTitle: { type: "string" },
      actionKind: { type: "string" },
      runtime: { type: "object", additionalProperties: true },
      preferredProvider: { type: "string", enum: ["anthropic", "openai", "deepmind", "praxis-native"] },
    },
  }),
  outputSchema: jsonSchema("code.lsp_applyCodeAction.output", {
    type: "object",
    additionalProperties: true,
    required: ["kind", "dryRun", "providerCalled"],
    properties: {
      kind: { type: "string", enum: ["agentCore.basicTool.lsp.applyCodeAction", "agentCore.basicTool.lsp.applyCodeAction.preview"] },
      dryRun: { type: "boolean" },
      providerCalled: { type: "boolean" },
    },
  }),
});

export const lspApplyCodeActionHandler: BaseToolHandler<
  LspApplyCodeActionBestPracticeRequest,
  LspApplyCodeActionBestPracticeOutput
> = {
  definition: lspApplyCodeActionBaseToolDefinition,
  async invoke(request) {
    const selection = preferAnthropicExecutor(
      request.executor,
      (executor) => executor.lsp?.applyCodeActionPreview !== undefined,
      lspApplyCodeActionProviderPractices,
      request.input.preferredProvider,
    );

    if (request.input.dryRun !== false) {
      const preview = planLspApplyCodeActionCore({
        ...request.input,
        runtimeId: request.runtimeId,
        sessionId: request.sessionId,
        workspaceRoot: request.input.workspaceRoot ?? request.input.runtime?.workspaceRoot,
        dryRun: true,
      });
      if (!preview.ok) return baseToolInvokeFailure("code.lsp_applyCodeAction", preview.error.code, preview.error.message, preview.events);
      return baseToolInvokeSuccess(
        "code.lsp_applyCodeAction",
        { kind: "agentCore.basicTool.lsp.applyCodeAction.preview", preview: preview.plan, dryRun: true, providerCalled: false, unsafeSideEffects: false },
        preview.events,
        { audit: buildPracticeAuditMetadata(selection) },
      );
    }

    const target = normalizeTarget(request.input);
    if (target === undefined) {
      return baseToolInvokeFailure("code.lsp_applyCodeAction", "MISSING_DOCUMENT_URI", "LSP code action preview requires documentUri", ["basicTool.lsp.applyCodeAction.rejected"]);
    }

    try {
      const executorApplyCodeAction = request.executor.lsp?.applyCodeActionPreview;
      const matchingActions =
        executorApplyCodeAction !== undefined && selection.providerName === "anthropic"
          ? await (async () => {
              const result = await executorApplyCodeAction({
                target: {
                  filePath: target.filePath,
                  range: request.input.editPreview?.filesTouched ? undefined as never : undefined as never,
                  languageId: target.languageId,
                },
                actionTitle: request.input.actionTitle,
                actionKind: request.input.actionKind,
                context: { invocationId: request.toolCallId, workspaceRoot: request.input.workspaceRoot ?? request.input.runtime?.workspaceRoot },
              });
              if (!result.ok) throw new Error(result.error.message);
              return result.output.actions as readonly LspRuntimeCodeAction[];
            })()
          : await codeActionsWithLspRuntime(
              {
                filePath: target.filePath,
                languageId: target.languageId,
                range: {
                  start: { line: 0, character: 0 },
                  end: { line: 0, character: 0 },
                },
              },
              request.input.runtime,
            );

      return baseToolInvokeSuccess(
        "code.lsp_applyCodeAction",
        { kind: "agentCore.basicTool.lsp.applyCodeAction", target, matchingActions, dryRun: false, providerCalled: true, appliesChanges: false, permissionsRequired: ["workspace:read", "workspace:edit", "lsp:read"], unsafeSideEffects: false },
        ["basicTool.lsp.applyCodeAction.providerCalled"],
        { audit: buildPracticeAuditMetadata(selection) },
      );
    } catch (error) {
      return baseToolInvokeFailure("code.lsp_applyCodeAction", "PROVIDER_REJECTED", "code.lsp_applyCodeAction provider rejected the invocation", ["basicTool.lsp.applyCodeAction.rejected"]);
    }
  },
};
