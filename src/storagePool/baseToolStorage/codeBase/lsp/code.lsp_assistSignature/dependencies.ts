import type { LspLocateDefinitionRuntimeOptions } from "../_shared/runtime.js";

export type LspAssistSignaturePracticeProviderName = "anthropic" | "openai" | "deepmind" | "praxis-native";

export type LspAssistSignatureDependencies = {
  runtime?: LspLocateDefinitionRuntimeOptions;
};

export const lspAssistSignatureDependencyDeclarations = [
  "workspace.read",
  "lsp.server.forTargetLanguage",
  "node.child_process.stdioJsonRpc",
] as const;
