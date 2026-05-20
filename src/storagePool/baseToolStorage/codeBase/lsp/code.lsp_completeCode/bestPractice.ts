import type { BaseToolHandler } from "../../../../../agentCore_executionEngine/basic_toolLayer/baseTools/baseToolDefinition.js";
import {
  type BaseToolLspCompletionItem,
  type BaseToolLspPosition,
} from "../../../../../agentCore_executionEngine/basic_toolLayer/baseTools/baseToolExecutorPort.js";
import {
  baseToolInvokeFailure,
  baseToolInvokeSuccess,
  buildPracticeAuditMetadata,
  createLspBaseToolDefinition,
  injectInvocationAudit,
  jsonSchema,
  lspCommonSchemaFragments,
  normalizeDocumentUriToFilePath,
  normalizeLspDependencyDeclarations,
  preferAnthropicExecutor,
} from "../_shared/baseToolAdapter.js";
import { planLspCodeCompletion as planLspCodeCompletionCore, type LspCompleteCodeRequest } from "./core.js";
import { completeWithLspRuntime, type LspLocateDefinitionRuntimeOptions, type LspRuntimeCompletionItem } from "../_shared/runtime.js";
import { anthropicLspCompleteCodePractice } from "./anthropic.js";
import { lspCompleteCodeDependencyDeclarations, type LspCompleteCodePracticeProviderName } from "./dependencies.js";
import { deepmindLspCompleteCodePractice } from "./deepmind.js";
import { openaiLspCompleteCodePractice } from "./openai.js";

export * from "./core.js";

export type LspCompleteCodeRuntimeOutput = {
  kind: "agentCore.basicTool.lsp.completeCode";
  target: { filePath: string; line: number; character: number; languageId?: string };
  items: readonly LspRuntimeCompletionItem[];
  dryRun: boolean;
  providerCalled: boolean;
  permissionsRequired: readonly ["workspace:read", "lsp:read"];
  unsafeSideEffects: false;
};

export type LspCompleteCodePreviewOutput = {
  kind: "agentCore.basicTool.lsp.completeCode.preview";
  preview: ReturnType<typeof planLspCodeCompletionCore> extends infer Result
    ? Result extends { ok: true; plan: infer Plan }
      ? Plan
      : never
    : never;
  dryRun: true;
  providerCalled: false;
  unsafeSideEffects: false;
};

export type LspCompleteCodeBestPracticeOutput = LspCompleteCodeRuntimeOutput | LspCompleteCodePreviewOutput;

export type LspCompleteCodeBestPracticeRequest = LspCompleteCodeRequest & {
  runtime?: LspLocateDefinitionRuntimeOptions;
  preferredProvider?: LspCompleteCodePracticeProviderName;
};

export const lspCompleteCodeProviderPractices = [
  anthropicLspCompleteCodePractice,
  openaiLspCompleteCodePractice,
  deepmindLspCompleteCodePractice,
] as const;

export const lspCompleteCodeBestPracticeDescriptor = {
  toolId: "code.lsp_completeCode",
  bestPractice: "anthropic-host-executor-or-shared-stdio-lsp-runtime",
  sourcePriority: ["cli", "agent-sdk", "api-sdk", "praxis-native"],
  providerPractices: lspCompleteCodeProviderPractices,
  dependencies: lspCompleteCodeDependencyDeclarations,
} as const;

export function planLspCodeCompletion(...args: Parameters<typeof planLspCodeCompletionCore>): ReturnType<typeof planLspCodeCompletionCore> {
  return planLspCodeCompletionCore(...args);
}

function normalizeTarget(request: LspCompleteCodeBestPracticeRequest): {
  target: BaseToolLspPosition;
  maxItems: number;
} | {
  code: string;
  message: string;
} {
  if (request.documentUri?.trim().length !== 0 && request.position !== undefined) {
    return {
      target: {
        filePath: normalizeDocumentUriToFilePath(request.documentUri ?? "", request.workspaceRoot ?? request.runtime?.workspaceRoot),
        line: request.position.line,
        character: request.position.character,
        languageId: request.runtime?.workspaceLanguageId,
      },
      maxItems: request.maxItems ?? 20,
    };
  }

  return {
    code: "MISSING_DOCUMENT_URI",
    message: "LSP code completion requires documentUri and position",
  };
}

function normalizeCompletionItems(items: readonly BaseToolLspCompletionItem[] | readonly LspRuntimeCompletionItem[]): readonly LspRuntimeCompletionItem[] {
  return items.map((item) => ({
    label: item.label,
    kind: item.kind,
    detail: item.detail,
    documentation: item.documentation,
    sortText: item.sortText,
    filterText: item.filterText,
    insertText: item.insertText,
    textEdit: item.textEdit,
  }));
}

export async function completeLspCode(request: LspCompleteCodeBestPracticeRequest) {
  const normalized = normalizeTarget(request);
  if ("code" in normalized) {
    throw new Error(normalized.message);
  }

  return completeWithLspRuntime(normalized.target, {
    ...request.runtime,
    workspaceRoot: request.runtime?.workspaceRoot ?? request.workspaceRoot,
    triggerCharacter: request.triggerCharacter,
    maxItems: normalized.maxItems,
  });
}

export const lspCompleteCodeBaseToolDefinition = createLspBaseToolDefinition<
  LspCompleteCodeBestPracticeRequest,
  LspCompleteCodeBestPracticeOutput
>({
  toolId: "code.lsp_completeCode",
  title: "Code LSP Complete Code",
  description: "Resolve semantic completion candidates through a governed LSP provider.",
  summary: "Use code.lsp_completeCode when the agent needs semantic completion candidates without applying a completion item.",
  permissionHints: ["workspace:read", "lsp:read"],
  dependencies: normalizeLspDependencyDeclarations(lspCompleteCodeDependencyDeclarations),
  inputSchema: jsonSchema("code.lsp_completeCode.input", {
    type: "object",
    additionalProperties: true,
    required: ["documentUri", "position"],
    properties: {
      documentUri: { type: "string", minLength: 1 },
      position: lspCommonSchemaFragments.lspPosition,
      triggerCharacter: { type: "string" },
      maxItems: { type: "integer", minimum: 1, maximum: 200 },
      workspaceRoot: { type: "string" },
      runtime: { type: "object", additionalProperties: true },
      preferredProvider: { type: "string", enum: ["anthropic", "openai", "deepmind", "praxis-native"] },
    },
  }),
  outputSchema: jsonSchema("code.lsp_completeCode.output", {
    type: "object",
    additionalProperties: true,
    required: ["kind", "dryRun", "providerCalled"],
    properties: {
      kind: { type: "string", enum: ["agentCore.basicTool.lsp.completeCode", "agentCore.basicTool.lsp.completeCode.preview"] },
      dryRun: { type: "boolean" },
      providerCalled: { type: "boolean" },
    },
  }),
});

export const lspCompleteCodeHandler: BaseToolHandler<
  LspCompleteCodeBestPracticeRequest,
  LspCompleteCodeBestPracticeOutput
> = {
  definition: lspCompleteCodeBaseToolDefinition,
  async invoke(request) {
    const selection = preferAnthropicExecutor(
      request.executor,
      (executor) => executor.lsp?.completeCode !== undefined,
      lspCompleteCodeProviderPractices,
      request.input.preferredProvider,
    );

    if (request.input.dryRun !== false) {
      const preview = planLspCodeCompletionCore({
        ...request.input,
        runtimeId: request.runtimeId,
        sessionId: request.sessionId,
        workspaceRoot: request.input.workspaceRoot ?? request.input.runtime?.workspaceRoot,
        dryRun: true,
      });
      if (!preview.ok) {
        return baseToolInvokeFailure("code.lsp_completeCode", preview.error.code, preview.error.message, preview.events);
      }
      return baseToolInvokeSuccess(
        "code.lsp_completeCode",
        {
          kind: "agentCore.basicTool.lsp.completeCode.preview",
          preview: preview.plan,
          dryRun: true,
          providerCalled: false,
          unsafeSideEffects: false,
        },
        preview.events,
        { audit: buildPracticeAuditMetadata(selection) },
      );
    }

    const normalized = normalizeTarget(request.input);
    if ("code" in normalized) {
      return baseToolInvokeFailure("code.lsp_completeCode", normalized.code, normalized.message, ["basicTool.lsp.completeCode.rejected"]);
    }

    try {
      const executorCompletion = request.executor.lsp?.completeCode;
      const items =
        executorCompletion !== undefined && selection.providerName === "anthropic"
          ? await (async () => {
              const result = await executorCompletion({
                target: normalized.target,
                triggerCharacter: request.input.triggerCharacter,
                maxItems: normalized.maxItems,
                context: {
                  invocationId: request.toolCallId,
                  workspaceRoot: request.input.workspaceRoot ?? request.input.runtime?.workspaceRoot,
                  auditMetadata: injectInvocationAudit(
                    {
                      ...buildPracticeAuditMetadata(selection),
                      ...(request.metadata ?? {}),
                    },
                    undefined,
                    request,
                  ),
                },
              });
              if (!result.ok) {
                throw new Error(result.error.message);
              }
              return normalizeCompletionItems(result.output.items);
            })()
          : await completeLspCode({
              ...request.input,
              runtime: {
                ...request.input.runtime,
                workspaceRoot: request.input.runtime?.workspaceRoot ?? request.input.workspaceRoot,
              },
            });

      return baseToolInvokeSuccess(
        "code.lsp_completeCode",
        {
          kind: "agentCore.basicTool.lsp.completeCode",
          target: normalized.target,
          items,
          dryRun: false,
          providerCalled: true,
          permissionsRequired: ["workspace:read", "lsp:read"],
          unsafeSideEffects: false,
        },
        ["basicTool.lsp.completeCode.providerCalled"],
        { audit: buildPracticeAuditMetadata(selection) },
      );
    } catch (error) {
      return baseToolInvokeFailure(
        "code.lsp_completeCode",
        "PROVIDER_REJECTED",
        "code.lsp_completeCode provider rejected the invocation",
        ["basicTool.lsp.completeCode.rejected"],
      );
    }
  },
};
