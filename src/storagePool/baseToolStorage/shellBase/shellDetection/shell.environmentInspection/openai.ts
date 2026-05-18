import { createHostExecutorShellEnvironmentInspectionProvider } from "./dependencies.js";
import type { ShellEnvironmentInspectionProviderPractice } from "./dependencies.js";

export const openaiShellEnvironmentInspectionPractice = {
  providerName: "openai",
  source: {
    kind: "cli",
    label: "Codex shell tool routing keeps environment reads in a governed host backend",
    path: "/home/proview/Desktop/three/codex_rust_0_123_0/codex-rs/core/src/tools",
  },
  directCliSupport: true,
  sideEffectPolicy: "runtime-governed",
  notes: [
    "Praxis shapes and redacts the output; runtime owns process environment reads.",
    "Provider dispatch is only used after context.dryRun is false and runtime governance is affirmative.",
  ],
  createProvider: ({ provider, executor }) => provider ?? createHostExecutorShellEnvironmentInspectionProvider(executor),
} satisfies ShellEnvironmentInspectionProviderPractice;
