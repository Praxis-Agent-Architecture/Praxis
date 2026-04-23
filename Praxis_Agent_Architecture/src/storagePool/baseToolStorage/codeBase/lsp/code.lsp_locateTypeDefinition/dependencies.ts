import type { LspLocateDefinitionRuntimeOptions } from "../_shared/runtime.js";
import type { LspLocateTypeDefinitionProvider } from "../code.lsp_locateTypeDefinition.js";

export type LspLocateTypeDefinitionPracticeProviderName = "anthropic" | "openai" | "deepmind" | "praxis-native";

export type LspLocateTypeDefinitionDependencies = {
  provider?: LspLocateTypeDefinitionProvider;
  runtime?: LspLocateDefinitionRuntimeOptions;
};

export const lspLocateTypeDefinitionDependencyDeclarations = [
  "workspace.read",
  "lsp.server.forTargetLanguage",
  "node.child_process.stdioJsonRpc",
] as const;
