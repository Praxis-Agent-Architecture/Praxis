import { planLspSymbolExplanation as planLspSymbolExplanationCore } from "../code.lsp_explainSymbol.js";
import { anthropicLspExplainSymbolPractice } from "./anthropic.js";
import { deepmindLspExplainSymbolPractice } from "./deepmind.js";
import { openaiLspExplainSymbolPractice } from "./openai.js";
import { lspExplainSymbolDependencyDeclarations } from "./dependencies.js";

export * from "../code.lsp_explainSymbol.js";

export const lspExplainSymbolBestPracticeDescriptor = {
  toolId: "code.lsp_explainSymbol",
  bestPractice: "shared-stdio-lsp-runtime-read-only",
  sourcePriority: ["cli", "agent-sdk", "api-sdk", "praxis-native"],
  providerPractices: [anthropicLspExplainSymbolPractice, openaiLspExplainSymbolPractice, deepmindLspExplainSymbolPractice],
  dependencies: lspExplainSymbolDependencyDeclarations,
} as const;

export function planLspSymbolExplanation(...args: Parameters<typeof planLspSymbolExplanationCore>): ReturnType<typeof planLspSymbolExplanationCore> {
  return planLspSymbolExplanationCore(...args);
}

import { hoverWithLspRuntime, locateDefinitionWithLspRuntime, traceReferencesWithLspRuntime, type LspLocateDefinitionRuntimeOptions } from "../_shared/runtime.js";

export type LspExplainSymbolRuntimeRequest = {
  target: { filePath: string; line: number; character: number; languageId?: string };
  runtime?: LspLocateDefinitionRuntimeOptions;
  includeDefinitionHint?: boolean;
  includeReferencesHint?: boolean;
};

export async function explainLspSymbol(request: LspExplainSymbolRuntimeRequest) {
  const [hover, definitions, references] = await Promise.all([
    hoverWithLspRuntime(request.target, request.runtime),
    request.includeDefinitionHint === false ? Promise.resolve([]) : locateDefinitionWithLspRuntime(request.target, request.runtime),
    request.includeReferencesHint === true
      ? traceReferencesWithLspRuntime(request.target, true, request.runtime)
      : Promise.resolve([]),
  ]);

  return { hover, definitions, references };
}
