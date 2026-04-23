import { scanLspDocumentSymbols as scanLspDocumentSymbolsCore, type LspScanDocumentSymbolsRequest } from "../code.lsp_scanDocumentSymbols.js";
import { anthropicLspScanDocumentSymbolsPractice } from "./anthropic.js";
import { deepmindLspScanDocumentSymbolsPractice } from "./deepmind.js";
import { openaiLspScanDocumentSymbolsPractice } from "./openai.js";

export * from "../code.lsp_scanDocumentSymbols.js";

export const lspScanDocumentSymbolsBestPracticeDescriptor = {
  toolId: "code.lsp_scanDocumentSymbols",
  bestPractice: "shared-stdio-lsp-runtime",
  providerPractices: [anthropicLspScanDocumentSymbolsPractice, openaiLspScanDocumentSymbolsPractice, deepmindLspScanDocumentSymbolsPractice],
} as const;

export async function scanLspDocumentSymbols(request: LspScanDocumentSymbolsRequest = {}) {
  return scanLspDocumentSymbolsCore(request);
}
