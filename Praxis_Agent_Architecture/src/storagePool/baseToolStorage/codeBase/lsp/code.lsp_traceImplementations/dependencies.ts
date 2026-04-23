import type { LspLocateDefinitionRuntimeOptions } from "../_shared/runtime.js";
import type { LspTraceImplementationsProvider } from "../code.lsp_traceImplementations.js";

export type LspTraceImplementationsPracticeProviderName = "anthropic" | "openai" | "deepmind" | "praxis-native";

export type LspTraceImplementationsDependencies = {
  provider?: LspTraceImplementationsProvider;
  runtime?: LspLocateDefinitionRuntimeOptions;
};

export const lspTraceImplementationsDependencyDeclarations = [
  "workspace.read",
  "lsp.server.forTargetLanguage",
  "node.child_process.stdioJsonRpc",
] as const;
