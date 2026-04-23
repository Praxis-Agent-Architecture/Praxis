import { suggestLspCodeActions as suggestLspCodeActionsCore, type LspSuggestCodeActionsRequest } from "../code.lsp_suggestCodeActions.js";
import { anthropicLspSuggestCodeActionsPractice } from "./anthropic.js";
import { deepmindLspSuggestCodeActionsPractice } from "./deepmind.js";
import { openaiLspSuggestCodeActionsPractice } from "./openai.js";

export * from "../code.lsp_suggestCodeActions.js";

export const lspSuggestCodeActionsBestPracticeDescriptor = {
  toolId: "code.lsp_suggestCodeActions",
  bestPractice: "shared-stdio-lsp-runtime-suggestion-only",
  providerPractices: [anthropicLspSuggestCodeActionsPractice, openaiLspSuggestCodeActionsPractice, deepmindLspSuggestCodeActionsPractice],
} as const;

export async function suggestLspCodeActions(request: LspSuggestCodeActionsRequest = {}) {
  return suggestLspCodeActionsCore(request);
}
