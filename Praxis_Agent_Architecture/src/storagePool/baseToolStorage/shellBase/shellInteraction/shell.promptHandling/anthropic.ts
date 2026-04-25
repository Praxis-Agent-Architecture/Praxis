import type { ShellPromptHandlingProviderPractice } from "./dependencies.js";
import { createHostExecutorShellPromptHandlingProvider } from "./dependencies.js";

export const anthropicShellPromptHandlingPractice = {
  providerName: "anthropic",
  source: { kind: "cli", label: "Claude Code terminal interaction practice keeps session ownership in the host runtime", path: "/home/proview/.claude" },
  directCliSupport: true,
  sideEffectPolicy: "runtime-governed",
  notes: [
    "Praxis baseTools shape and audit the request; runtime owns session/process policy and side effects.",
    "Provider dispatch is only used after context.dryRun is false and runtime governance is affirmative.",
    "This adapter is host-executor based; it does not claim an SDK-owned prompt loop or hidden shell fallback.",
  ],
  createProvider: ({ provider, executor }) => provider ?? createHostExecutorShellPromptHandlingProvider(executor),
} as const satisfies ShellPromptHandlingProviderPractice;
