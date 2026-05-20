import type { BaseToolHandler } from "../../../../../executionEngine/basic_toolLayer/baseTools/baseToolDefinition.js";
import { baseToolInvokeFailure, baseToolInvokeSuccess, buildPracticeAuditMetadata, createLspBaseToolDefinition, jsonSchema, normalizeDocumentUriToFilePath, normalizeLspDependencyDeclarations, preferAnthropicExecutor } from "../_shared/baseToolAdapter.js";
import { inspectLspSymbol as inspectLspSymbolCore, type LspInspectSymbolRequest, type LspSymbolInfo } from "./core.js";
import { scanDocumentSymbolsWithLspRuntime, type LspLocateDefinitionRuntimeOptions, type LspRuntimeDocumentSymbol } from "../_shared/runtime.js";
import { anthropicLspInspectSymbolPractice } from "./anthropic.js";
import { lspInspectSymbolDependencyDeclarations, type LspInspectSymbolPracticeProviderName } from "./dependencies.js";
import { deepmindLspInspectSymbolPractice } from "./deepmind.js";
import { openaiLspInspectSymbolPractice } from "./openai.js";

export * from "./core.js";

export type LspInspectSymbolRuntimeOutput = {
  kind: "agentCore.basicTool.lsp.inspectSymbol";
  target: { filePath: string; languageId?: string; position?: { line: number; character: number }; symbolName?: string };
  candidates: readonly LspSymbolInfo[];
  dryRun: boolean;
  providerCalled: boolean;
  permissionsRequired: readonly ["workspace:read", "lsp:read"];
  unsafeSideEffects: false;
};

export type LspInspectSymbolPreviewOutput = {
  kind: "agentCore.basicTool.lsp.inspectSymbol.preview";
  preview: ReturnType<typeof inspectLspSymbolCore> extends infer Result
    ? Result extends { ok: true; snapshot: infer Snapshot }
      ? Snapshot
      : never
    : never;
  dryRun: true;
  providerCalled: false;
  unsafeSideEffects: false;
};

export type LspInspectSymbolBestPracticeOutput = LspInspectSymbolRuntimeOutput | LspInspectSymbolPreviewOutput;

export type LspInspectSymbolBestPracticeRequest = LspInspectSymbolRequest & {
  runtime?: LspLocateDefinitionRuntimeOptions;
  preferredProvider?: LspInspectSymbolPracticeProviderName;
};

export const lspInspectSymbolProviderPractices = [
  anthropicLspInspectSymbolPractice,
  openaiLspInspectSymbolPractice,
  deepmindLspInspectSymbolPractice,
] as const;

export const lspInspectSymbolBestPracticeDescriptor = {
  toolId: "code.lsp_inspectSymbol",
  bestPractice: "anthropic-host-executor-or-shared-stdio-lsp-runtime",
  sourcePriority: ["cli", "agent-sdk", "api-sdk", "praxis-native"],
  providerPractices: lspInspectSymbolProviderPractices,
  dependencies: lspInspectSymbolDependencyDeclarations,
} as const;

function flattenSymbols(symbols: readonly LspRuntimeDocumentSymbol[]): readonly LspRuntimeDocumentSymbol[] {
  return symbols.flatMap((symbol) => [symbol, ...flattenSymbols(symbol.children ?? [])]);
}

function comparePosition(
  left: { line: number; character: number },
  right: { line: number; character: number },
): number {
  return left.line === right.line ? left.character - right.character : left.line - right.line;
}

function containsPosition(
  symbol: LspRuntimeDocumentSymbol,
  position: { line: number; character: number },
): boolean {
  const range = symbol.selectionRange ?? symbol.range;
  return comparePosition(range.start, position) <= 0 && comparePosition(position, range.end) <= 0;
}

function normalizeRuntimeSymbol(symbol: LspRuntimeDocumentSymbol): LspSymbolInfo {
  return {
    name: symbol.name,
    kind: symbol.kind as LspSymbolInfo["kind"],
    range: symbol.range,
    selectionRange: symbol.selectionRange,
    detail: symbol.detail,
  };
}

function normalizeTarget(request: LspInspectSymbolBestPracticeRequest) {
  if (request.documentUri?.trim().length !== 0) {
    return {
      filePath: normalizeDocumentUriToFilePath(request.documentUri ?? "", request.runtime?.workspaceRoot),
      languageId: request.runtime?.workspaceLanguageId,
      position: request.target?.position,
      symbolName: request.target?.symbolName?.trim() || undefined,
    };
  }
  return undefined;
}

export const lspInspectSymbolBaseToolDefinition = createLspBaseToolDefinition<
  LspInspectSymbolBestPracticeRequest,
  LspInspectSymbolBestPracticeOutput
>({
  toolId: "code.lsp_inspectSymbol",
  title: "Code LSP Inspect Symbol",
  description: "Inspect symbol metadata through a governed LSP provider.",
  summary: "Use code.lsp_inspectSymbol when the agent needs a symbol snapshot at a position or by exact symbol name.",
  permissionHints: ["workspace:read", "lsp:read"],
  dependencies: normalizeLspDependencyDeclarations(lspInspectSymbolDependencyDeclarations),
  inputSchema: jsonSchema("code.lsp_inspectSymbol.input", {
    type: "object",
    additionalProperties: true,
    required: ["documentUri"],
    properties: {
      documentUri: { type: "string", minLength: 1 },
      target: { type: "object", additionalProperties: true },
      runtime: { type: "object", additionalProperties: true },
      preferredProvider: { type: "string", enum: ["anthropic", "openai", "deepmind", "praxis-native"] },
    },
  }),
  outputSchema: jsonSchema("code.lsp_inspectSymbol.output", {
    type: "object",
    additionalProperties: true,
    required: ["kind", "dryRun", "providerCalled"],
    properties: {
      kind: { type: "string", enum: ["agentCore.basicTool.lsp.inspectSymbol", "agentCore.basicTool.lsp.inspectSymbol.preview"] },
      dryRun: { type: "boolean" },
      providerCalled: { type: "boolean" },
    },
  }),
});

export const lspInspectSymbolHandler: BaseToolHandler<
  LspInspectSymbolBestPracticeRequest,
  LspInspectSymbolBestPracticeOutput
> = {
  definition: lspInspectSymbolBaseToolDefinition,
  async invoke(request) {
    const selection = preferAnthropicExecutor(
      request.executor,
      (executor) => executor.lsp?.inspectSymbol !== undefined,
      lspInspectSymbolProviderPractices,
      request.input.preferredProvider,
    );

    if (request.input.dryRun !== false) {
      const preview = inspectLspSymbolCore({
        ...request.input,
        runtimeId: request.runtimeId,
        sessionId: request.sessionId,
        invocationId: request.toolCallId,
        dryRun: true,
      });
      if (!preview.ok) return baseToolInvokeFailure("code.lsp_inspectSymbol", preview.error.code, preview.error.message, preview.events);
      return baseToolInvokeSuccess(
        "code.lsp_inspectSymbol",
        { kind: "agentCore.basicTool.lsp.inspectSymbol.preview", preview: preview.snapshot, dryRun: true, providerCalled: false, unsafeSideEffects: false },
        preview.events,
        { audit: buildPracticeAuditMetadata(selection) },
      );
    }

    const target = normalizeTarget(request.input);
    if (target === undefined) {
      return baseToolInvokeFailure("code.lsp_inspectSymbol", "MISSING_DOCUMENT_URI", "LSP symbol inspection requires documentUri", ["basicTool.lsp.inspectSymbol.rejected"]);
    }

    try {
      const executorInspectSymbol = request.executor.lsp?.inspectSymbol;
      const candidates =
        executorInspectSymbol !== undefined && selection.providerName === "anthropic"
          ? await (async () => {
              const result = await executorInspectSymbol({
                target,
                context: { invocationId: request.toolCallId, workspaceRoot: request.input.runtime?.workspaceRoot },
              });
              if (!result.ok) throw new Error(result.error.message);
              return result.output.symbols as readonly LspSymbolInfo[];
            })()
          : flattenSymbols(await scanDocumentSymbolsWithLspRuntime({ filePath: target.filePath, languageId: target.languageId }, request.input.runtime))
              .filter((symbol) => {
                const nameMatches = target.symbolName === undefined || symbol.name === target.symbolName;
                const positionMatches = target.position === undefined || containsPosition(symbol, target.position);
                return nameMatches && positionMatches;
              })
              .map(normalizeRuntimeSymbol);

      return baseToolInvokeSuccess(
        "code.lsp_inspectSymbol",
        { kind: "agentCore.basicTool.lsp.inspectSymbol", target, candidates, dryRun: false, providerCalled: true, permissionsRequired: ["workspace:read", "lsp:read"], unsafeSideEffects: false },
        ["basicTool.lsp.inspectSymbol.providerCalled"],
        { audit: buildPracticeAuditMetadata(selection) },
      );
    } catch (error) {
      return baseToolInvokeFailure("code.lsp_inspectSymbol", "PROVIDER_REJECTED", "code.lsp_inspectSymbol provider rejected the invocation", ["basicTool.lsp.inspectSymbol.rejected"]);
    }
  },
};
