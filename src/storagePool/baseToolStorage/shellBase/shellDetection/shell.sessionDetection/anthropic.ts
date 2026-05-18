import { createHostExecutorShellSessionDetectionProvider } from "./dependencies.js";
import type { ShellSessionDetectionProviderPractice } from "./dependencies.js";

export const anthropicShellSessionDetectionPractice = {
  providerName: "anthropic",
  source: {
    kind: "cli",
    label: "Claude Code keeps shell session observation behind a governed host runtime",
    path: "/home/proview/.claude",
  },
  directCliSupport: true,
  sideEffectPolicy: "runtime-governed",
  notes: [
    "Praxis shapes and audits session hints; runtime owns process/session observation.",
    "Provider dispatch is only used after context.dryRun is false and runtime governance is affirmative.",
  ],
  createProvider: ({ provider, executor }) => provider ?? createHostExecutorShellSessionDetectionProvider(executor),
} satisfies ShellSessionDetectionProviderPractice;
