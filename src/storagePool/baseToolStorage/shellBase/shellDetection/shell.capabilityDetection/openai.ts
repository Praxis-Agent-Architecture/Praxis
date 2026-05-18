import { createHostExecutorShellCapabilityDetectionProvider } from "./dependencies.js";
import type { ShellCapabilityDetectionProviderPractice } from "./dependencies.js";

export const openaiShellCapabilityDetectionPractice = {
  providerName: "openai",
  source: {
    kind: "cli",
    label: "Codex shell tool routing keeps probing in a governed host backend",
    path: "/home/proview/Desktop/three/codex_rust_0_123_0/codex-rs/core/src/tools",
  },
  directCliSupport: true,
  sideEffectPolicy: "runtime-governed",
  notes: [
    "Praxis shapes and audits the probe; runtime owns shell execution and process policy.",
    "Provider dispatch is only used after context.dryRun is false and runtime governance is affirmative.",
  ],
  createProvider: ({ provider, executor }) => provider ?? createHostExecutorShellCapabilityDetectionProvider(executor),
} satisfies ShellCapabilityDetectionProviderPractice;
