import { createHostExecutorShellEnvironmentInspectionProvider } from "./dependencies.js";
import type { ShellEnvironmentInspectionProviderPractice } from "./dependencies.js";

export const deepmindShellEnvironmentInspectionPractice = {
  providerName: "deepmind",
  source: {
    kind: "cli",
    label: "Gemini CLI delegates shell environment side effects to the CLI runtime",
    path: "/home/proview/Desktop/three/gemini-cli",
  },
  directCliSupport: true,
  sideEffectPolicy: "runtime-governed",
  notes: [
    "Praxis shapes and redacts the output; runtime owns process environment reads.",
    "Provider dispatch is only used after context.dryRun is false and runtime governance is affirmative.",
  ],
  createProvider: ({ provider, executor }) => provider ?? createHostExecutorShellEnvironmentInspectionProvider(executor),
} satisfies ShellEnvironmentInspectionProviderPractice;
