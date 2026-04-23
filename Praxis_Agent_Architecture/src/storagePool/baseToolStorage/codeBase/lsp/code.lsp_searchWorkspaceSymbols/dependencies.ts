import type { LspLocateDefinitionRuntimeOptions } from "../_shared/runtime.js";
import type { LspSearchWorkspaceSymbolsProvider } from "../code.lsp_searchWorkspaceSymbols.js";

export type LspSearchWorkspaceSymbolsPracticeProviderName = "anthropic" | "openai" | "deepmind" | "praxis-native";

export type LspSearchWorkspaceSymbolsDependencies = {
  provider?: LspSearchWorkspaceSymbolsProvider;
  runtime?: LspLocateDefinitionRuntimeOptions;
};

export const lspSearchWorkspaceSymbolsDependencyDeclarations = [
  "workspace.read",
  "lsp.server.forTargetLanguage",
  "node.child_process.stdioJsonRpc",
] as const;
