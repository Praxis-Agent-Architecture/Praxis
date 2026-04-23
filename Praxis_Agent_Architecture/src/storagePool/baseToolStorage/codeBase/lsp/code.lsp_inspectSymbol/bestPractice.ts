import { inspectLspSymbol as inspectLspSymbolCore } from "../code.lsp_inspectSymbol.js";
import { anthropicLspInspectSymbolPractice } from "./anthropic.js";
import { deepmindLspInspectSymbolPractice } from "./deepmind.js";
import { openaiLspInspectSymbolPractice } from "./openai.js";
import { lspInspectSymbolDependencyDeclarations } from "./dependencies.js";

export * from "../code.lsp_inspectSymbol.js";

export const lspInspectSymbolBestPracticeDescriptor = {
  toolId: "code.lsp_inspectSymbol",
  bestPractice: "shared-stdio-lsp-runtime-read-only",
  sourcePriority: ["cli", "agent-sdk", "api-sdk", "praxis-native"],
  providerPractices: [anthropicLspInspectSymbolPractice, openaiLspInspectSymbolPractice, deepmindLspInspectSymbolPractice],
  dependencies: lspInspectSymbolDependencyDeclarations,
} as const;

export function inspectLspSymbol(...args: Parameters<typeof inspectLspSymbolCore>): ReturnType<typeof inspectLspSymbolCore> {
  return inspectLspSymbolCore(...args);
}

import { scanDocumentSymbolsWithLspRuntime, type LspLocateDefinitionRuntimeOptions, type LspRuntimeDocumentSymbol } from "../_shared/runtime.js";

export type LspInspectSymbolRuntimeRequest = {
  target: { filePath: string; languageId?: string; position?: { line: number; character: number }; symbolName?: string };
  runtime?: LspLocateDefinitionRuntimeOptions;
};

function flattenSymbols(symbols: readonly LspRuntimeDocumentSymbol[]): readonly LspRuntimeDocumentSymbol[] {
  return symbols.flatMap((symbol) => [symbol, ...flattenSymbols(symbol.children ?? [])]);
}

function containsPosition(symbol: LspRuntimeDocumentSymbol, position: { line: number; character: number }): boolean {
  const range = symbol.selectionRange ?? symbol.range;
  const afterStart = position.line > range.start.line || (position.line === range.start.line && position.character >= range.start.character);
  const beforeEnd = position.line < range.end.line || (position.line === range.end.line && position.character <= range.end.character);
  return afterStart && beforeEnd;
}

export async function inspectLspSymbolFromRuntime(request: LspInspectSymbolRuntimeRequest) {
  const symbols = flattenSymbols(await scanDocumentSymbolsWithLspRuntime(request.target, request.runtime));
  return symbols.filter((symbol) => {
    const nameMatches = request.target.symbolName === undefined || symbol.name === request.target.symbolName;
    const positionMatches = request.target.position === undefined || containsPosition(symbol, request.target.position);
    return nameMatches && positionMatches;
  });
}
