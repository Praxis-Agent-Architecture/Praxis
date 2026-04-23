import { planLspCodeCompletion as planLspCodeCompletionCore } from "../code.lsp_completeCode.js";
import { anthropicLspCompleteCodePractice } from "./anthropic.js";
import { deepmindLspCompleteCodePractice } from "./deepmind.js";
import { openaiLspCompleteCodePractice } from "./openai.js";
import { lspCompleteCodeDependencyDeclarations } from "./dependencies.js";

export * from "../code.lsp_completeCode.js";

export const lspCompleteCodeBestPracticeDescriptor = {
  toolId: "code.lsp_completeCode",
  bestPractice: "shared-stdio-lsp-runtime-read-only",
  sourcePriority: ["cli", "agent-sdk", "api-sdk", "praxis-native"],
  providerPractices: [anthropicLspCompleteCodePractice, openaiLspCompleteCodePractice, deepmindLspCompleteCodePractice],
  dependencies: lspCompleteCodeDependencyDeclarations,
} as const;

export function planLspCodeCompletion(...args: Parameters<typeof planLspCodeCompletionCore>): ReturnType<typeof planLspCodeCompletionCore> {
  return planLspCodeCompletionCore(...args);
}

import { completeWithLspRuntime, type LspLocateDefinitionRuntimeOptions } from "../_shared/runtime.js";

export type LspCompleteCodeRuntimeRequest = {
  target: { filePath: string; line: number; character: number; languageId?: string };
  runtime?: LspLocateDefinitionRuntimeOptions;
  triggerCharacter?: string;
  maxItems?: number;
};

export async function completeLspCode(request: LspCompleteCodeRuntimeRequest) {
  return completeWithLspRuntime(request.target, {
    ...request.runtime,
    triggerCharacter: request.triggerCharacter,
    maxItems: request.maxItems,
  });
}
