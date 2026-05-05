import type { LspLocateDefinitionRuntimeOptions } from "../_shared/runtime.js";
import type { LspTraceReferencesProvider } from "./core.js";

export type LspTraceReferencesPracticeProviderName = "anthropic" | "openai" | "deepmind" | "praxis-native";

export type LspTraceReferencesDependencies = {
  provider?: LspTraceReferencesProvider;
  runtime?: LspLocateDefinitionRuntimeOptions;
};

export const lspTraceReferencesDependencyDeclarations = [
  "workspace.read",
  "lsp.server.forTargetLanguage",
  "node.child_process.stdioJsonRpc",
] as const;
