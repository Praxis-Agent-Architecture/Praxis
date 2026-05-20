import type { BaseToolHandler } from "../../../../../agentCore_executionEngine/basic_toolLayer/baseTools/baseToolDefinition.js";
import { baseToolInvokeFailure, baseToolInvokeSuccess, buildPracticeAuditMetadata, createLspBaseToolDefinition, jsonSchema, lspCommonSchemaFragments, normalizeDocumentUriToFilePath, normalizeLspDependencyDeclarations, preferAnthropicExecutor } from "../_shared/baseToolAdapter.js";
import { planLspSignatureAssistance as planLspSignatureAssistanceCore, type LspAssistSignatureRequest } from "./core.js";
import { signatureHelpWithLspRuntime, type LspLocateDefinitionRuntimeOptions, type LspRuntimeSignatureHelp } from "../_shared/runtime.js";
import { anthropicLspAssistSignaturePractice } from "./anthropic.js";
import { lspAssistSignatureDependencyDeclarations, type LspAssistSignaturePracticeProviderName } from "./dependencies.js";
import { deepmindLspAssistSignaturePractice } from "./deepmind.js";
import { openaiLspAssistSignaturePractice } from "./openai.js";

export * from "./core.js";

export type LspAssistSignatureRuntimeOutput = {
  kind: "agentCore.basicTool.lsp.assistSignature";
  target: { filePath: string; line: number; character: number; languageId?: string };
  signatureHelp: LspRuntimeSignatureHelp;
  dryRun: boolean;
  providerCalled: boolean;
  permissionsRequired: readonly ["workspace:read", "lsp:read"];
  unsafeSideEffects: false;
};

export type LspAssistSignaturePreviewOutput = {
  kind: "agentCore.basicTool.lsp.assistSignature.preview";
  preview: ReturnType<typeof planLspSignatureAssistanceCore> extends infer Result
    ? Result extends { ok: true; plan: infer Plan }
      ? Plan
      : never
    : never;
  dryRun: true;
  providerCalled: false;
  unsafeSideEffects: false;
};

export type LspAssistSignatureBestPracticeOutput = LspAssistSignatureRuntimeOutput | LspAssistSignaturePreviewOutput;

export type LspAssistSignatureBestPracticeRequest = LspAssistSignatureRequest & {
  runtime?: LspLocateDefinitionRuntimeOptions;
  preferredProvider?: LspAssistSignaturePracticeProviderName;
};

export const lspAssistSignatureProviderPractices = [
  anthropicLspAssistSignaturePractice,
  openaiLspAssistSignaturePractice,
  deepmindLspAssistSignaturePractice,
] as const;

export const lspAssistSignatureBestPracticeDescriptor = {
  toolId: "code.lsp_assistSignature",
  bestPractice: "anthropic-host-executor-or-shared-stdio-lsp-runtime",
  sourcePriority: ["cli", "agent-sdk", "api-sdk", "praxis-native"],
  providerPractices: lspAssistSignatureProviderPractices,
  dependencies: lspAssistSignatureDependencyDeclarations,
} as const;

function normalizeTarget(request: LspAssistSignatureBestPracticeRequest) {
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

export const lspAssistSignatureBaseToolDefinition = createLspBaseToolDefinition<
  LspAssistSignatureBestPracticeRequest,
  LspAssistSignatureBestPracticeOutput
>({
  toolId: "code.lsp_assistSignature",
  title: "Code LSP Assist Signature",
  description: "Resolve signature-help information through a governed LSP provider.",
  summary: "Use code.lsp_assistSignature when the agent needs function or method signature help at a cursor position.",
  permissionHints: ["workspace:read", "lsp:read"],
  dependencies: normalizeLspDependencyDeclarations(lspAssistSignatureDependencyDeclarations),
  inputSchema: jsonSchema("code.lsp_assistSignature.input", {
    type: "object",
    additionalProperties: true,
    required: ["documentUri", "position"],
    properties: {
      documentUri: { type: "string", minLength: 1 },
      position: lspCommonSchemaFragments.lspPosition,
      triggerCharacter: { type: "string" },
      workspaceRoot: { type: "string" },
      runtime: { type: "object", additionalProperties: true },
      preferredProvider: { type: "string", enum: ["anthropic", "openai", "deepmind", "praxis-native"] },
    },
  }),
  outputSchema: jsonSchema("code.lsp_assistSignature.output", {
    type: "object",
    additionalProperties: true,
    required: ["kind", "dryRun", "providerCalled"],
    properties: {
      kind: { type: "string", enum: ["agentCore.basicTool.lsp.assistSignature", "agentCore.basicTool.lsp.assistSignature.preview"] },
      dryRun: { type: "boolean" },
      providerCalled: { type: "boolean" },
    },
  }),
});

export const lspAssistSignatureHandler: BaseToolHandler<
  LspAssistSignatureBestPracticeRequest,
  LspAssistSignatureBestPracticeOutput
> = {
  definition: lspAssistSignatureBaseToolDefinition,
  async invoke(request) {
    const selection = preferAnthropicExecutor(
      request.executor,
      (executor) => executor.lsp?.assistSignature !== undefined,
      lspAssistSignatureProviderPractices,
      request.input.preferredProvider,
    );

    if (request.input.dryRun !== false) {
      const preview = planLspSignatureAssistanceCore({
        ...request.input,
        runtimeId: request.runtimeId,
        sessionId: request.sessionId,
        workspaceRoot: request.input.workspaceRoot ?? request.input.runtime?.workspaceRoot,
        dryRun: true,
      });
      if (!preview.ok) {
        return baseToolInvokeFailure("code.lsp_assistSignature", preview.error.code, preview.error.message, preview.events);
      }
      return baseToolInvokeSuccess(
        "code.lsp_assistSignature",
        {
          kind: "agentCore.basicTool.lsp.assistSignature.preview",
          preview: preview.plan,
          dryRun: true,
          providerCalled: false,
          unsafeSideEffects: false,
        },
        preview.events,
        { audit: buildPracticeAuditMetadata(selection) },
      );
    }

    const target = normalizeTarget(request.input);
    if (target === undefined) {
      return baseToolInvokeFailure("code.lsp_assistSignature", "MISSING_DOCUMENT_URI", "LSP signature help requires documentUri and position", ["basicTool.lsp.assistSignature.rejected"]);
    }

    try {
      const executorAssistSignature = request.executor.lsp?.assistSignature;
      const signatureHelp =
        executorAssistSignature !== undefined && selection.providerName === "anthropic"
          ? await (async () => {
              const result = await executorAssistSignature({
                target,
                triggerCharacter: request.input.triggerCharacter,
                context: { invocationId: request.toolCallId, workspaceRoot: request.input.workspaceRoot ?? request.input.runtime?.workspaceRoot },
              });
              if (!result.ok) throw new Error(result.error.message);
              return result.output.signatureHelp;
            })()
          : await signatureHelpWithLspRuntime(target, {
              ...request.input.runtime,
              workspaceRoot: request.input.runtime?.workspaceRoot ?? request.input.workspaceRoot,
              triggerCharacter: request.input.triggerCharacter,
            });

      return baseToolInvokeSuccess(
        "code.lsp_assistSignature",
        {
          kind: "agentCore.basicTool.lsp.assistSignature",
          target,
          signatureHelp,
          dryRun: false,
          providerCalled: true,
          permissionsRequired: ["workspace:read", "lsp:read"],
          unsafeSideEffects: false,
        },
        ["basicTool.lsp.assistSignature.providerCalled"],
        { audit: buildPracticeAuditMetadata(selection) },
      );
    } catch (error) {
      return baseToolInvokeFailure(
        "code.lsp_assistSignature",
        "PROVIDER_REJECTED",
        "code.lsp_assistSignature provider rejected the invocation",
        ["basicTool.lsp.assistSignature.rejected"],
      );
    }
  },
};
