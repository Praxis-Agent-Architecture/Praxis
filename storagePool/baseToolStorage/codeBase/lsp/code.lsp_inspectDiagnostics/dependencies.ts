import type { LspLocateDefinitionRuntimeOptions } from "../_shared/runtime.js";

export type LspInspectDiagnosticsPracticeProviderName = "anthropic" | "openai" | "deepmind" | "praxis-native";

export type LspInspectDiagnosticsDependencies = {
  runtime?: LspLocateDefinitionRuntimeOptions;
};

export const lspInspectDiagnosticsDependencyDeclarations = [
  "workspace.read",
  "lsp.server.forTargetLanguage",
  "node.child_process.stdioJsonRpc",
] as const;
