import type { LspLocateDefinitionRuntimeOptions } from "../_shared/runtime.js";

export type LspInspectSymbolPracticeProviderName = "anthropic" | "openai" | "deepmind" | "praxis-native";

export type LspInspectSymbolDependencies = {
  runtime?: LspLocateDefinitionRuntimeOptions;
};

export const lspInspectSymbolDependencyDeclarations = [
  "workspace.read",
  "lsp.server.forTargetLanguage",
  "node.child_process.stdioJsonRpc",
] as const;
