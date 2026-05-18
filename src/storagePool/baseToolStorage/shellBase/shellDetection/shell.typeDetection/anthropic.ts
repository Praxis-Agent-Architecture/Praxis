import { createHostExecutorShellTypeDetectionProvider } from "./dependencies.js";
import type { ShellTypeDetectionProviderPractice } from "./dependencies.js";

export const anthropicShellTypeDetectionPractice = {
  providerName: "anthropic",
  source: {
    kind: "cli",
    label: "Claude Code keeps shell identity probing behind a governed host runtime",
    path: "/home/proview/.claude",
  },
  directCliSupport: true,
  sideEffectPolicy: "runtime-governed",
  notes: [
    "Praxis normalizes shell identity; runtime owns real probing.",
    "Provider dispatch is only used after context.dryRun is false and runtime governance is affirmative.",
  ],
  createProvider: ({ provider, executor }) => provider ?? createHostExecutorShellTypeDetectionProvider(executor),
} satisfies ShellTypeDetectionProviderPractice;
