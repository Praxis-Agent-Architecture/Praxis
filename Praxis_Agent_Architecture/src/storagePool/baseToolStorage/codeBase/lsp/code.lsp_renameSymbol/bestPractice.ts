import { renameLspSymbol as renameLspSymbolCore, type LspRenameSymbolRequest } from "../code.lsp_renameSymbol.js";
import { anthropicLspRenameSymbolPractice } from "./anthropic.js";
import { deepmindLspRenameSymbolPractice } from "./deepmind.js";
import { openaiLspRenameSymbolPractice } from "./openai.js";

export * from "../code.lsp_renameSymbol.js";

export const lspRenameSymbolBestPracticeDescriptor = {
  toolId: "code.lsp_renameSymbol",
  bestPractice: "shared-stdio-lsp-runtime-preview-only",
  providerPractices: [anthropicLspRenameSymbolPractice, openaiLspRenameSymbolPractice, deepmindLspRenameSymbolPractice],
} as const;

export async function renameLspSymbol(request: LspRenameSymbolRequest = {}) {
  return renameLspSymbolCore(request);
}
