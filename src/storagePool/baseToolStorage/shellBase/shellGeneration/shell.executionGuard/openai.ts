import { createHostExecutorShellExecutionGuardProvider, type ShellExecutionGuardProviderPractice } from "./dependencies.js";

export const openaiShellExecutionGuardPractice = {
  providerName: "openai",
  source: {
    kind: "cli",
    label: "Codex sandboxing and shell approval requirement before exec",
    path: "/home/proview/Desktop/three/codex_rust_0_123_0/codex-rs/core/src/tools/sandboxing.rs",
  },
  directCliSupport: true,
  sideEffectPolicy: "runtime-governed",
  notes: [
    "Codex computes approval requirements before shell runtime dispatch.",
    "Guard generation classifies risk without spawning processes.",
  ],
  createProvider: ({ provider, executor }) => provider ?? createHostExecutorShellExecutionGuardProvider(executor),
} as const satisfies ShellExecutionGuardProviderPractice;
