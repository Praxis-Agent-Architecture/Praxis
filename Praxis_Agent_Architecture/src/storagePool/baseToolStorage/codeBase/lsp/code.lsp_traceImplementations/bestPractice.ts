import { traceLspImplementations as traceLspImplementationsCore, type LspTraceImplementationsRequest } from "../code.lsp_traceImplementations.js";
import { anthropicLspTraceImplementationsPractice } from "./anthropic.js";
import { deepmindLspTraceImplementationsPractice } from "./deepmind.js";
import { openaiLspTraceImplementationsPractice } from "./openai.js";

export * from "../code.lsp_traceImplementations.js";

export const lspTraceImplementationsBestPracticeDescriptor = {
  toolId: "code.lsp_traceImplementations",
  bestPractice: "shared-stdio-lsp-runtime",
  providerPractices: [anthropicLspTraceImplementationsPractice, openaiLspTraceImplementationsPractice, deepmindLspTraceImplementationsPractice],
} as const;

export async function traceLspImplementations(request: LspTraceImplementationsRequest = {}) {
  return traceLspImplementationsCore(request);
}
