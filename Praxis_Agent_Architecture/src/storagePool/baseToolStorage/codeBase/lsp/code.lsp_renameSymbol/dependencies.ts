import type { LspLocateDefinitionRuntimeOptions } from "../_shared/runtime.js";
import type { LspRenameSymbolProvider } from "../code.lsp_renameSymbol.js";

export type LspRenameSymbolPracticeProviderName = "anthropic" | "openai" | "deepmind" | "praxis-native";

export type LspRenameSymbolDependencies = {
  provider?: LspRenameSymbolProvider;
  runtime?: LspLocateDefinitionRuntimeOptions;
};

export const lspRenameSymbolDependencyDeclarations = [
  "workspace.read",
  "workspace.edit.preview",
  "lsp.server.forTargetLanguage",
  "node.child_process.stdioJsonRpc",
] as const;
