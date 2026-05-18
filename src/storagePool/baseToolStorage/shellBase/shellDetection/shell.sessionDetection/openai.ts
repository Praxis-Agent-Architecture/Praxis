import { createHostExecutorShellSessionDetectionProvider } from "./dependencies.js";
import type { ShellSessionDetectionProviderPractice } from "./dependencies.js";

export const openaiShellSessionDetectionPractice = {
  providerName: "openai",
  source: {
    kind: "cli",
    label: "Codex shell tool routing keeps session observation in a governed host backend",
    path: "/home/proview/Desktop/three/codex_rust_0_123_0/codex-rs/core/src/tools",
  },
  directCliSupport: true,
  sideEffectPolicy: "runtime-governed",
  notes: [
    "Praxis shapes and audits session hints; runtime owns process/session observation.",
    "Provider dispatch is only used after context.dryRun is false and runtime governance is affirmative.",
  ],
  createProvider: ({ provider, executor }) => provider ?? createHostExecutorShellSessionDetectionProvider(executor),
} satisfies ShellSessionDetectionProviderPractice;
