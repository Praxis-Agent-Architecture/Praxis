import { inspectLspDiagnostics as inspectLspDiagnosticsCore } from "../code.lsp_inspectDiagnostics.js";
import { anthropicLspInspectDiagnosticsPractice } from "./anthropic.js";
import { deepmindLspInspectDiagnosticsPractice } from "./deepmind.js";
import { openaiLspInspectDiagnosticsPractice } from "./openai.js";
import { lspInspectDiagnosticsDependencyDeclarations } from "./dependencies.js";

export * from "../code.lsp_inspectDiagnostics.js";

export const lspInspectDiagnosticsBestPracticeDescriptor = {
  toolId: "code.lsp_inspectDiagnostics",
  bestPractice: "shared-stdio-lsp-runtime-read-only",
  sourcePriority: ["cli", "agent-sdk", "api-sdk", "praxis-native"],
  providerPractices: [anthropicLspInspectDiagnosticsPractice, openaiLspInspectDiagnosticsPractice, deepmindLspInspectDiagnosticsPractice],
  dependencies: lspInspectDiagnosticsDependencyDeclarations,
} as const;

export function inspectLspDiagnostics(...args: Parameters<typeof inspectLspDiagnosticsCore>): ReturnType<typeof inspectLspDiagnosticsCore> {
  return inspectLspDiagnosticsCore(...args);
}

import { inspectDiagnosticsWithLspRuntime, type LspLocateDefinitionRuntimeOptions } from "../_shared/runtime.js";

export type LspInspectDiagnosticsRuntimeRequest = {
  target: { filePath: string; languageId?: string };
  runtime?: LspLocateDefinitionRuntimeOptions & { waitMs?: number };
};

export async function inspectLspDiagnosticsFromRuntime(request: LspInspectDiagnosticsRuntimeRequest) {
  return inspectDiagnosticsWithLspRuntime(request.target, request.runtime);
}
