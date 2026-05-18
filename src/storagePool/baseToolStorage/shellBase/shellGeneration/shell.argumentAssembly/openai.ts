import { createHostExecutorShellArgumentAssemblyProvider, type ShellArgumentAssemblyProviderPractice } from "./dependencies.js";

export const openaiShellArgumentAssemblyPractice = {
  providerName: "openai",
  source: {
    kind: "cli",
    label: "Codex ShellToolCallParams command vector and shlex_join preview",
    path: "/home/proview/Desktop/three/codex_rust_0_123_0/codex-rs/core/src/tools/context.rs",
  },
  directCliSupport: true,
  sideEffectPolicy: "runtime-governed",
  notes: [
    "Codex local shell payload keeps command as a vector and derives the log preview with shlex_join.",
    "Praxis mirrors that by preserving argv separately from rendered command previews.",
  ],
  createProvider: ({ provider, executor }) => provider ?? createHostExecutorShellArgumentAssemblyProvider(executor),
} as const satisfies ShellArgumentAssemblyProviderPractice;
