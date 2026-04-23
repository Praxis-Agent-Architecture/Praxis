import type { LspLocateDefinitionRuntimeOptions } from "../_shared/runtime.js";
import type { LspScanDocumentSymbolsProvider } from "../code.lsp_scanDocumentSymbols.js";

export type LspScanDocumentSymbolsPracticeProviderName = "anthropic" | "openai" | "deepmind" | "praxis-native";

export type LspScanDocumentSymbolsDependencies = {
  provider?: LspScanDocumentSymbolsProvider;
  runtime?: LspLocateDefinitionRuntimeOptions;
};

export const lspScanDocumentSymbolsDependencyDeclarations = [
  "workspace.read",
  "lsp.server.forTargetLanguage",
  "node.child_process.stdioJsonRpc",
] as const;
