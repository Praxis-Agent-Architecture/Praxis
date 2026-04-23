import type { LspLocateDefinitionRuntimeOptions } from "../_shared/runtime.js";

export type LspCompleteCodePracticeProviderName = "anthropic" | "openai" | "deepmind" | "praxis-native";

export type LspCompleteCodeDependencies = {
  runtime?: LspLocateDefinitionRuntimeOptions;
};

export const lspCompleteCodeDependencyDeclarations = [
  "workspace.read",
  "lsp.server.forTargetLanguage",
  "node.child_process.stdioJsonRpc",
] as const;
