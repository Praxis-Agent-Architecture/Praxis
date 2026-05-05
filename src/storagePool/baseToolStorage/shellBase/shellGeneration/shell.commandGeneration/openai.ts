import { createHostExecutorShellCommandGenerationProvider, type ShellCommandGenerationProviderPractice } from "./dependencies.js";

export const openaiShellCommandGenerationPractice = {
  providerName: "openai",
  source: {
    kind: "cli",
    label: "Codex shell handler shlex_join and shell command payload construction",
    path: "/home/proview/Desktop/three/codex_rust_0_123_0/codex-rs/core/src/tools/handlers/shell.rs",
  },
  directCliSupport: true,
  sideEffectPolicy: "runtime-governed",
  notes: [
    "Codex derives command previews from structured shell payloads before execution policy.",
    "Praxis represents the preview as a dry-run command envelope.",
  ],
  createProvider: ({ provider, executor }) => provider ?? createHostExecutorShellCommandGenerationProvider(executor),
} as const satisfies ShellCommandGenerationProviderPractice;
