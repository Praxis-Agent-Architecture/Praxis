import { createHostExecutorShellCapabilityDetectionProvider } from "./dependencies.js";
import type { ShellCapabilityDetectionProviderPractice } from "./dependencies.js";

export const anthropicShellCapabilityDetectionPractice = {
  providerName: "anthropic",
  source: {
    kind: "cli",
    label: "Claude Code keeps shell capability probing behind a governed host runtime",
    path: "/home/proview/.claude",
  },
  directCliSupport: true,
  sideEffectPolicy: "runtime-governed",
  notes: [
    "Praxis shapes and audits the probe; runtime owns shell execution and process policy.",
    "Provider dispatch is only used after context.dryRun is false and runtime governance is affirmative.",
  ],
  createProvider: ({ provider, executor }) => provider ?? createHostExecutorShellCapabilityDetectionProvider(executor),
} satisfies ShellCapabilityDetectionProviderPractice;
