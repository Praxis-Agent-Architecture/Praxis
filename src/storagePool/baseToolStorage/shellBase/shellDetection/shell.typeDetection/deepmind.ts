import { createHostExecutorShellTypeDetectionProvider } from "./dependencies.js";
import type { ShellTypeDetectionProviderPractice } from "./dependencies.js";

export const deepmindShellTypeDetectionPractice = {
  providerName: "deepmind",
  source: {
    kind: "cli",
    label: "Gemini CLI delegates shell identity side effects to the CLI runtime",
    path: "/home/proview/Desktop/three/gemini-cli",
  },
  directCliSupport: true,
  sideEffectPolicy: "runtime-governed",
  notes: [
    "Praxis normalizes shell identity; runtime owns real probing.",
    "Provider dispatch is only used after context.dryRun is false and runtime governance is affirmative.",
  ],
  createProvider: ({ provider, executor }) => provider ?? createHostExecutorShellTypeDetectionProvider(executor),
} satisfies ShellTypeDetectionProviderPractice;
