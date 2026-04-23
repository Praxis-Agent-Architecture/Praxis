import { planLspSignatureAssistance as planLspSignatureAssistanceCore } from "../code.lsp_assistSignature.js";
import { anthropicLspAssistSignaturePractice } from "./anthropic.js";
import { deepmindLspAssistSignaturePractice } from "./deepmind.js";
import { openaiLspAssistSignaturePractice } from "./openai.js";
import { lspAssistSignatureDependencyDeclarations } from "./dependencies.js";

export * from "../code.lsp_assistSignature.js";

export const lspAssistSignatureBestPracticeDescriptor = {
  toolId: "code.lsp_assistSignature",
  bestPractice: "shared-stdio-lsp-runtime-read-only",
  sourcePriority: ["cli", "agent-sdk", "api-sdk", "praxis-native"],
  providerPractices: [anthropicLspAssistSignaturePractice, openaiLspAssistSignaturePractice, deepmindLspAssistSignaturePractice],
  dependencies: lspAssistSignatureDependencyDeclarations,
} as const;

export function planLspSignatureAssistance(...args: Parameters<typeof planLspSignatureAssistanceCore>): ReturnType<typeof planLspSignatureAssistanceCore> {
  return planLspSignatureAssistanceCore(...args);
}

import { signatureHelpWithLspRuntime, type LspLocateDefinitionRuntimeOptions } from "../_shared/runtime.js";

export type LspAssistSignatureRuntimeRequest = {
  target: { filePath: string; line: number; character: number; languageId?: string };
  runtime?: LspLocateDefinitionRuntimeOptions;
  triggerCharacter?: string;
};

export async function assistLspSignature(request: LspAssistSignatureRuntimeRequest) {
  return signatureHelpWithLspRuntime(request.target, {
    ...request.runtime,
    triggerCharacter: request.triggerCharacter,
  });
}
