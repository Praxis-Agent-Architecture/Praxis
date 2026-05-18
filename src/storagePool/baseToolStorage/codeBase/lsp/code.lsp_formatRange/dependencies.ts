import type { LspLocateDefinitionRuntimeOptions } from "../_shared/runtime.js";

export type LspFormatRangePracticeProviderName = "anthropic" | "openai" | "deepmind" | "praxis-native";

export type LspFormatRangeDependencies = {
  runtime?: LspLocateDefinitionRuntimeOptions;
};

export const lspFormatRangeDependencyDeclarations = [
  "workspace.read",
  "lsp.server.forTargetLanguage",
  "node.child_process.stdioJsonRpc",
] as const;
