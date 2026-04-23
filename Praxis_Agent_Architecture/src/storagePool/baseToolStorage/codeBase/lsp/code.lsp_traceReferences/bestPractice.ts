import { traceLspReferences as traceLspReferencesCore, type LspTraceReferencesRequest } from "../code.lsp_traceReferences.js";
import { anthropicLspTraceReferencesPractice } from "./anthropic.js";
import { deepmindLspTraceReferencesPractice } from "./deepmind.js";
import { openaiLspTraceReferencesPractice } from "./openai.js";

export * from "../code.lsp_traceReferences.js";

export const lspTraceReferencesBestPracticeDescriptor = {
  toolId: "code.lsp_traceReferences",
  bestPractice: "shared-stdio-lsp-runtime",
  providerPractices: [anthropicLspTraceReferencesPractice, openaiLspTraceReferencesPractice, deepmindLspTraceReferencesPractice],
} as const;

export async function traceLspReferences(request: LspTraceReferencesRequest = {}) {
  return traceLspReferencesCore(request);
}
