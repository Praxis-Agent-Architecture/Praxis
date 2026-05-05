import { createHostExecutorShellCapabilityDetectionProvider } from "./dependencies.js";
import type { ShellCapabilityDetectionProviderPractice } from "./dependencies.js";

export const deepmindShellCapabilityDetectionPractice = {
  providerName: "deepmind",
  source: {
    kind: "cli",
    label: "Gemini CLI delegates shell probing side effects to the CLI runtime",
    path: "/home/proview/Desktop/three/gemini-cli",
  },
  directCliSupport: true,
  sideEffectPolicy: "runtime-governed",
  notes: [
    "Praxis shapes and audits the probe; runtime owns shell execution and process policy.",
    "Provider dispatch is only used after context.dryRun is false and runtime governance is affirmative.",
  ],
  createProvider: ({ provider, executor }) => provider ?? createHostExecutorShellCapabilityDetectionProvider(executor),
} satisfies ShellCapabilityDetectionProviderPractice;
