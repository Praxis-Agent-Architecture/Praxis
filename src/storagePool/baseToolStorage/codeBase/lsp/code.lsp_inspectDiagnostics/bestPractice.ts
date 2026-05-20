import type { BaseToolHandler } from "../../../../../agentCore_executionEngine/basic_toolLayer/baseTools/baseToolDefinition.js";
import { baseToolInvokeFailure, baseToolInvokeSuccess, buildPracticeAuditMetadata, createLspBaseToolDefinition, jsonSchema, normalizeDocumentUriToFilePath, normalizeLspDependencyDeclarations, preferAnthropicExecutor } from "../_shared/baseToolAdapter.js";
import { inspectLspDiagnostics as inspectLspDiagnosticsCore, type LspInspectDiagnosticsRequest } from "./core.js";
import { inspectDiagnosticsWithLspRuntime, type LspLocateDefinitionRuntimeOptions, type LspRuntimeDiagnostic } from "../_shared/runtime.js";
import { anthropicLspInspectDiagnosticsPractice } from "./anthropic.js";
import { lspInspectDiagnosticsDependencyDeclarations, type LspInspectDiagnosticsPracticeProviderName } from "./dependencies.js";
import { deepmindLspInspectDiagnosticsPractice } from "./deepmind.js";
import { openaiLspInspectDiagnosticsPractice } from "./openai.js";

export * from "./core.js";

export type LspInspectDiagnosticsRuntimeOutput = {
  kind: "agentCore.basicTool.lsp.inspectDiagnostics";
  target: { filePath: string; languageId?: string };
  diagnostics: readonly LspRuntimeDiagnostic[];
  dryRun: boolean;
  providerCalled: boolean;
  permissionsRequired: readonly ["workspace:read", "lsp:read"];
  unsafeSideEffects: false;
};

export type LspInspectDiagnosticsPreviewOutput = {
  kind: "agentCore.basicTool.lsp.inspectDiagnostics.preview";
  preview: ReturnType<typeof inspectLspDiagnosticsCore> extends infer Result
    ? Result extends { ok: true; snapshot: infer Snapshot }
      ? Snapshot
      : never
    : never;
  dryRun: true;
  providerCalled: false;
  unsafeSideEffects: false;
};

export type LspInspectDiagnosticsBestPracticeOutput = LspInspectDiagnosticsRuntimeOutput | LspInspectDiagnosticsPreviewOutput;

export type LspInspectDiagnosticsBestPracticeRequest = LspInspectDiagnosticsRequest & {
  runtime?: LspLocateDefinitionRuntimeOptions & { waitMs?: number };
  preferredProvider?: LspInspectDiagnosticsPracticeProviderName;
};

export const lspInspectDiagnosticsProviderPractices = [
  anthropicLspInspectDiagnosticsPractice,
  openaiLspInspectDiagnosticsPractice,
  deepmindLspInspectDiagnosticsPractice,
] as const;

export const lspInspectDiagnosticsBestPracticeDescriptor = {
  toolId: "code.lsp_inspectDiagnostics",
  bestPractice: "anthropic-host-executor-or-shared-stdio-lsp-runtime",
  sourcePriority: ["cli", "agent-sdk", "api-sdk", "praxis-native"],
  providerPractices: lspInspectDiagnosticsProviderPractices,
  dependencies: lspInspectDiagnosticsDependencyDeclarations,
} as const;

function normalizeTarget(request: LspInspectDiagnosticsBestPracticeRequest) {
  if (request.documentUri?.trim().length !== 0) {
    return {
      filePath: normalizeDocumentUriToFilePath(request.documentUri ?? "", request.runtime?.workspaceRoot),
      languageId: request.runtime?.workspaceLanguageId,
    };
  }
  return undefined;
}

export const lspInspectDiagnosticsBaseToolDefinition = createLspBaseToolDefinition<
  LspInspectDiagnosticsBestPracticeRequest,
  LspInspectDiagnosticsBestPracticeOutput
>({
  toolId: "code.lsp_inspectDiagnostics",
  title: "Code LSP Inspect Diagnostics",
  description: "Inspect live diagnostics through a governed LSP provider.",
  summary: "Use code.lsp_inspectDiagnostics when the agent needs current compiler or language-server diagnostics for a file.",
  permissionHints: ["workspace:read", "lsp:read"],
  dependencies: normalizeLspDependencyDeclarations(lspInspectDiagnosticsDependencyDeclarations),
  inputSchema: jsonSchema("code.lsp_inspectDiagnostics.input", {
    type: "object",
    additionalProperties: true,
    required: ["documentUri"],
    properties: {
      documentUri: { type: "string", minLength: 1 },
      runtime: { type: "object", additionalProperties: true },
      preferredProvider: { type: "string", enum: ["anthropic", "openai", "deepmind", "praxis-native"] },
    },
  }),
  outputSchema: jsonSchema("code.lsp_inspectDiagnostics.output", {
    type: "object",
    additionalProperties: true,
    required: ["kind", "dryRun", "providerCalled"],
    properties: {
      kind: { type: "string", enum: ["agentCore.basicTool.lsp.inspectDiagnostics", "agentCore.basicTool.lsp.inspectDiagnostics.preview"] },
      dryRun: { type: "boolean" },
      providerCalled: { type: "boolean" },
    },
  }),
});

export const lspInspectDiagnosticsHandler: BaseToolHandler<
  LspInspectDiagnosticsBestPracticeRequest,
  LspInspectDiagnosticsBestPracticeOutput
> = {
  definition: lspInspectDiagnosticsBaseToolDefinition,
  async invoke(request) {
    const selection = preferAnthropicExecutor(
      request.executor,
      (executor) => executor.lsp?.inspectDiagnostics !== undefined,
      lspInspectDiagnosticsProviderPractices,
      request.input.preferredProvider,
    );

    if (request.input.dryRun !== false) {
      const preview = inspectLspDiagnosticsCore({
        ...request.input,
        runtimeId: request.runtimeId,
        sessionId: request.sessionId,
        invocationId: request.toolCallId,
        dryRun: true,
      });
      if (!preview.ok) return baseToolInvokeFailure("code.lsp_inspectDiagnostics", preview.error.code, preview.error.message, preview.events);
      return baseToolInvokeSuccess(
        "code.lsp_inspectDiagnostics",
        { kind: "agentCore.basicTool.lsp.inspectDiagnostics.preview", preview: preview.snapshot, dryRun: true, providerCalled: false, unsafeSideEffects: false },
        preview.events,
        { audit: buildPracticeAuditMetadata(selection) },
      );
    }

    const target = normalizeTarget(request.input);
    if (target === undefined) {
      return baseToolInvokeFailure("code.lsp_inspectDiagnostics", "MISSING_DOCUMENT_URI", "LSP diagnostics inspection requires documentUri", ["basicTool.lsp.inspectDiagnostics.rejected"]);
    }

    try {
      const executorInspectDiagnostics = request.executor.lsp?.inspectDiagnostics;
      const diagnostics =
        executorInspectDiagnostics !== undefined && selection.providerName === "anthropic"
          ? await (async () => {
              const result = await executorInspectDiagnostics({
                target,
                waitMs: request.input.runtime?.waitMs,
                context: { invocationId: request.toolCallId, workspaceRoot: request.input.runtime?.workspaceRoot },
              });
              if (!result.ok) throw new Error(result.error.message);
              return result.output.diagnostics;
            })()
          : await inspectDiagnosticsWithLspRuntime(target, request.input.runtime);

      return baseToolInvokeSuccess(
        "code.lsp_inspectDiagnostics",
        { kind: "agentCore.basicTool.lsp.inspectDiagnostics", target, diagnostics, dryRun: false, providerCalled: true, permissionsRequired: ["workspace:read", "lsp:read"], unsafeSideEffects: false },
        ["basicTool.lsp.inspectDiagnostics.providerCalled"],
        { audit: buildPracticeAuditMetadata(selection) },
      );
    } catch (error) {
      return baseToolInvokeFailure("code.lsp_inspectDiagnostics", "PROVIDER_REJECTED", "code.lsp_inspectDiagnostics provider rejected the invocation", ["basicTool.lsp.inspectDiagnostics.rejected"]);
    }
  },
};
