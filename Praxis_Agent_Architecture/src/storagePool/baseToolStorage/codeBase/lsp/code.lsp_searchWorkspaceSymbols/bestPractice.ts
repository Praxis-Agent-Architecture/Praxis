import { searchLspWorkspaceSymbols as searchLspWorkspaceSymbolsCore, type LspSearchWorkspaceSymbolsRequest } from "../code.lsp_searchWorkspaceSymbols.js";
import { anthropicLspSearchWorkspaceSymbolsPractice } from "./anthropic.js";
import { deepmindLspSearchWorkspaceSymbolsPractice } from "./deepmind.js";
import { openaiLspSearchWorkspaceSymbolsPractice } from "./openai.js";

export * from "../code.lsp_searchWorkspaceSymbols.js";

export const lspSearchWorkspaceSymbolsBestPracticeDescriptor = {
  toolId: "code.lsp_searchWorkspaceSymbols",
  bestPractice: "shared-stdio-lsp-runtime",
  providerPractices: [anthropicLspSearchWorkspaceSymbolsPractice, openaiLspSearchWorkspaceSymbolsPractice, deepmindLspSearchWorkspaceSymbolsPractice],
} as const;

export async function searchLspWorkspaceSymbols(request: LspSearchWorkspaceSymbolsRequest = {}) {
  return searchLspWorkspaceSymbolsCore(request);
}
