import type { LspLocateDefinitionRuntimeOptions } from "../_shared/runtime.js";

export type LspApplyCodeActionPracticeProviderName = "anthropic" | "openai" | "deepmind" | "praxis-native";

export type LspApplyCodeActionDependencies = {
  runtime?: LspLocateDefinitionRuntimeOptions;
};

export const lspApplyCodeActionDependencyDeclarations = [
  "workspace.read",
  "lsp.server.forTargetLanguage",
  "node.child_process.stdioJsonRpc",
] as const;
