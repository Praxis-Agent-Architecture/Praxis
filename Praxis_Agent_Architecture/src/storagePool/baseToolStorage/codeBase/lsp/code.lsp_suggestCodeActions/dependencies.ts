import type { LspLocateDefinitionRuntimeOptions } from "../_shared/runtime.js";
import type { LspSuggestCodeActionsProvider } from "./core.js";

export type LspSuggestCodeActionsPracticeProviderName = "anthropic" | "openai" | "deepmind" | "praxis-native";

export type LspSuggestCodeActionsDependencies = {
  provider?: LspSuggestCodeActionsProvider;
  runtime?: LspLocateDefinitionRuntimeOptions;
};

export const lspSuggestCodeActionsDependencyDeclarations = [
  "workspace.read",
  "lsp.server.forTargetLanguage",
  "node.child_process.stdioJsonRpc",
] as const;
