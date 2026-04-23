import { locateLspTypeDefinition as locateLspTypeDefinitionCore, type LspLocateTypeDefinitionRequest } from "../code.lsp_locateTypeDefinition.js";
import { anthropicLspLocateTypeDefinitionPractice } from "./anthropic.js";
import { deepmindLspLocateTypeDefinitionPractice } from "./deepmind.js";
import { openaiLspLocateTypeDefinitionPractice } from "./openai.js";

export * from "../code.lsp_locateTypeDefinition.js";

export const lspLocateTypeDefinitionBestPracticeDescriptor = {
  toolId: "code.lsp_locateTypeDefinition",
  bestPractice: "shared-stdio-lsp-runtime",
  providerPractices: [anthropicLspLocateTypeDefinitionPractice, openaiLspLocateTypeDefinitionPractice, deepmindLspLocateTypeDefinitionPractice],
} as const;

export async function locateLspTypeDefinition(request: LspLocateTypeDefinitionRequest = {}) {
  return locateLspTypeDefinitionCore(request);
}
