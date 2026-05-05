import { createHostExecutorShellTypeDetectionProvider } from "./dependencies.js";
import type { ShellTypeDetectionProviderPractice } from "./dependencies.js";

export const openaiShellTypeDetectionPractice = {
  providerName: "openai",
  source: {
    kind: "cli",
    label: "Codex shell tool routing keeps shell identity probing in a governed host backend",
    path: "/home/proview/Desktop/three/codex_rust_0_123_0/codex-rs/core/src/tools",
  },
  directCliSupport: true,
  sideEffectPolicy: "runtime-governed",
  notes: [
    "Praxis normalizes shell identity; runtime owns real probing.",
    "Provider dispatch is only used after context.dryRun is false and runtime governance is affirmative.",
  ],
  createProvider: ({ provider, executor }) => provider ?? createHostExecutorShellTypeDetectionProvider(executor),
} satisfies ShellTypeDetectionProviderPractice;
