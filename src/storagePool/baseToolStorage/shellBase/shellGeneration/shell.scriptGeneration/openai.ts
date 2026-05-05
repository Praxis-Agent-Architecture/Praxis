import { createHostExecutorShellScriptGenerationProvider, type ShellScriptGenerationProviderPractice } from "./dependencies.js";

export const openaiShellScriptGenerationPractice = {
  providerName: "openai",
  source: {
    kind: "cli",
    label: "Codex shell runtime command construction and approval boundary",
    path: "/home/proview/Desktop/three/codex_rust_0_123_0/codex-rs/core/src/tools/handlers/shell.rs",
  },
  directCliSupport: true,
  sideEffectPolicy: "runtime-governed",
  notes: [
    "Codex keeps shell runtime construction behind tool handler and approval logic.",
    "Generated script material is returned as auditable dry-run output.",
  ],
  createProvider: ({ provider, executor }) => provider ?? createHostExecutorShellScriptGenerationProvider(executor),
} as const satisfies ShellScriptGenerationProviderPractice;
