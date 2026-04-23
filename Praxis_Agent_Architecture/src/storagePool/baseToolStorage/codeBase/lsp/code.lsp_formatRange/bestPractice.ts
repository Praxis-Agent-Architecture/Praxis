import { createLspFormatRangePlan as createLspFormatRangePlanCore } from "../code.lsp_formatRange.js";
import { anthropicLspFormatRangePractice } from "./anthropic.js";
import { deepmindLspFormatRangePractice } from "./deepmind.js";
import { openaiLspFormatRangePractice } from "./openai.js";
import { lspFormatRangeDependencyDeclarations } from "./dependencies.js";

export * from "../code.lsp_formatRange.js";

export const lspFormatRangeBestPracticeDescriptor = {
  toolId: "code.lsp_formatRange",
  bestPractice: "shared-stdio-lsp-runtime-preview-only",
  sourcePriority: ["cli", "agent-sdk", "api-sdk", "praxis-native"],
  providerPractices: [anthropicLspFormatRangePractice, openaiLspFormatRangePractice, deepmindLspFormatRangePractice],
  dependencies: lspFormatRangeDependencyDeclarations,
} as const;

export function createLspFormatRangePlan(...args: Parameters<typeof createLspFormatRangePlanCore>): ReturnType<typeof createLspFormatRangePlanCore> {
  return createLspFormatRangePlanCore(...args);
}

import { formatRangeWithLspRuntime, type LspLocateDefinitionRuntimeOptions } from "../_shared/runtime.js";
import type { LspRange } from "../code.lsp_locateDefinition.js";

export type LspFormatRangeRuntimeRequest = {
  target: { filePath: string; languageId?: string };
  range: LspRange;
  options?: { tabSize?: number; insertSpaces?: boolean };
  runtime?: LspLocateDefinitionRuntimeOptions;
};

export async function formatLspRange(request: LspFormatRangeRuntimeRequest) {
  return formatRangeWithLspRuntime(
    request.target,
    request.range,
    { tabSize: request.options?.tabSize ?? 2, insertSpaces: request.options?.insertSpaces ?? true },
    request.runtime,
  );
}
