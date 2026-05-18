import type { ShellStdinFeedingProviderPractice } from "./dependencies.js";
import { createHostExecutorShellStdinFeedingProvider } from "./dependencies.js";

export const anthropicShellStdinFeedingPractice = {
  providerName: "anthropic",
  source: { kind: "cli", label: "Claude Code terminal interaction practice keeps session ownership in the host runtime", path: "/home/proview/.claude" },
  directCliSupport: true,
  sideEffectPolicy: "runtime-governed",
  notes: [
    "Praxis baseTools shape and audit the request; runtime owns session/process policy and side effects.",
    "Provider dispatch is only used after context.dryRun is false and runtime governance is affirmative.",
    "This adapter is host-executor based; it does not claim an SDK-owned stdin stream or hidden shell fallback.",
  ],
  createProvider: ({ provider, executor }) => provider ?? createHostExecutorShellStdinFeedingProvider(executor),
} as const satisfies ShellStdinFeedingProviderPractice;
