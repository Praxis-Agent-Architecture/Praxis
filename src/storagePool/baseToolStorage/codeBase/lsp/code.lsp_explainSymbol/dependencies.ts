import type { LspLocateDefinitionRuntimeOptions } from "../_shared/runtime.js";

export type LspExplainSymbolPracticeProviderName = "anthropic" | "openai" | "deepmind" | "praxis-native";

export type LspExplainSymbolDependencies = {
  runtime?: LspLocateDefinitionRuntimeOptions;
};

export const lspExplainSymbolDependencyDeclarations = [
  "workspace.read",
  "lsp.server.forTargetLanguage",
  "node.child_process.stdioJsonRpc",
] as const;
