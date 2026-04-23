import { createLspFormatDocumentPlan as createLspFormatDocumentPlanCore } from "../code.lsp_formatDocument.js";
import { anthropicLspFormatDocumentPractice } from "./anthropic.js";
import { deepmindLspFormatDocumentPractice } from "./deepmind.js";
import { openaiLspFormatDocumentPractice } from "./openai.js";
import { lspFormatDocumentDependencyDeclarations } from "./dependencies.js";

export * from "../code.lsp_formatDocument.js";

export const lspFormatDocumentBestPracticeDescriptor = {
  toolId: "code.lsp_formatDocument",
  bestPractice: "shared-stdio-lsp-runtime-preview-only",
  sourcePriority: ["cli", "agent-sdk", "api-sdk", "praxis-native"],
  providerPractices: [anthropicLspFormatDocumentPractice, openaiLspFormatDocumentPractice, deepmindLspFormatDocumentPractice],
  dependencies: lspFormatDocumentDependencyDeclarations,
} as const;

export function createLspFormatDocumentPlan(...args: Parameters<typeof createLspFormatDocumentPlanCore>): ReturnType<typeof createLspFormatDocumentPlanCore> {
  return createLspFormatDocumentPlanCore(...args);
}

import { formatDocumentWithLspRuntime, type LspLocateDefinitionRuntimeOptions } from "../_shared/runtime.js";

export type LspFormatDocumentRuntimeRequest = {
  target: { filePath: string; languageId?: string };
  options?: { tabSize?: number; insertSpaces?: boolean };
  runtime?: LspLocateDefinitionRuntimeOptions;
};

export async function formatLspDocument(request: LspFormatDocumentRuntimeRequest) {
  return formatDocumentWithLspRuntime(
    request.target,
    { tabSize: request.options?.tabSize ?? 2, insertSpaces: request.options?.insertSpaces ?? true },
    request.runtime,
  );
}
