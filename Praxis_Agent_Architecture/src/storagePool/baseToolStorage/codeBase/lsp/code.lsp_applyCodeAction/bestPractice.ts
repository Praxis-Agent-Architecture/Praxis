import { planLspApplyCodeAction as planLspApplyCodeActionCore } from "../code.lsp_applyCodeAction.js";
import { anthropicLspApplyCodeActionPractice } from "./anthropic.js";
import { deepmindLspApplyCodeActionPractice } from "./deepmind.js";
import { openaiLspApplyCodeActionPractice } from "./openai.js";
import { lspApplyCodeActionDependencyDeclarations } from "./dependencies.js";

export * from "../code.lsp_applyCodeAction.js";

export const lspApplyCodeActionBestPracticeDescriptor = {
  toolId: "code.lsp_applyCodeAction",
  bestPractice: "shared-stdio-lsp-runtime-preview-only",
  sourcePriority: ["cli", "agent-sdk", "api-sdk", "praxis-native"],
  providerPractices: [anthropicLspApplyCodeActionPractice, openaiLspApplyCodeActionPractice, deepmindLspApplyCodeActionPractice],
  dependencies: lspApplyCodeActionDependencyDeclarations,
} as const;

export function planLspApplyCodeAction(...args: Parameters<typeof planLspApplyCodeActionCore>): ReturnType<typeof planLspApplyCodeActionCore> {
  return planLspApplyCodeActionCore(...args);
}

import { codeActionsWithLspRuntime, type LspLocateDefinitionRuntimeOptions } from "../_shared/runtime.js";
import type { LspRange } from "../code.lsp_locateDefinition.js";

export type LspApplyCodeActionRuntimePreviewRequest = {
  target: { filePath: string; range: LspRange; languageId?: string };
  runtime?: LspLocateDefinitionRuntimeOptions;
  actionTitle?: string;
  actionKind?: string;
};

export async function previewLspCodeActionApplication(request: LspApplyCodeActionRuntimePreviewRequest) {
  const actions = await codeActionsWithLspRuntime(request.target, request.runtime);
  return actions.filter((action) => {
    const titleMatches = request.actionTitle === undefined || action.title === request.actionTitle;
    const kindMatches = request.actionKind === undefined || action.kind === request.actionKind;
    return titleMatches && kindMatches;
  });
}
