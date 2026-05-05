import type { LspLocateDefinitionRuntimeOptions } from "../_shared/runtime.js";

export type LspFormatDocumentPracticeProviderName = "anthropic" | "openai" | "deepmind" | "praxis-native";

export type LspFormatDocumentDependencies = {
  runtime?: LspLocateDefinitionRuntimeOptions;
};

export const lspFormatDocumentDependencyDeclarations = [
  "workspace.read",
  "lsp.server.forTargetLanguage",
  "node.child_process.stdioJsonRpc",
] as const;
