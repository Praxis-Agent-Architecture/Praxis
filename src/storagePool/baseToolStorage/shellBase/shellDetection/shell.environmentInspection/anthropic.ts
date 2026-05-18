import { createHostExecutorShellEnvironmentInspectionProvider } from "./dependencies.js";
import type { ShellEnvironmentInspectionProviderPractice } from "./dependencies.js";

export const anthropicShellEnvironmentInspectionPractice = {
  providerName: "anthropic",
  source: {
    kind: "cli",
    label: "Claude Code keeps shell environment reads behind a governed host runtime",
    path: "/home/proview/.claude",
  },
  directCliSupport: true,
  sideEffectPolicy: "runtime-governed",
  notes: [
    "Praxis shapes and redacts the output; runtime owns process environment reads.",
    "Provider dispatch is only used after context.dryRun is false and runtime governance is affirmative.",
  ],
  createProvider: ({ provider, executor }) => provider ?? createHostExecutorShellEnvironmentInspectionProvider(executor),
} satisfies ShellEnvironmentInspectionProviderPractice;
