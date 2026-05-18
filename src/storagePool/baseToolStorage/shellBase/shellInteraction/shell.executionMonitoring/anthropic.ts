import type { ShellExecutionMonitoringProviderPractice } from "./dependencies.js";
import { createHostExecutorShellExecutionMonitoringProvider } from "./dependencies.js";

export const anthropicShellExecutionMonitoringPractice = {
  providerName: "anthropic",
  source: { kind: "cli", label: "Claude Code terminal interaction practice keeps session ownership in the host runtime", path: "/home/proview/.claude" },
  directCliSupport: true,
  sideEffectPolicy: "runtime-governed",
  notes: [
    "Praxis baseTools shape and audit the request; runtime owns session/process policy and side effects.",
    "Provider dispatch is only used after context.dryRun is false and runtime governance is affirmative.",
    "This adapter is host-executor based; it does not claim an SDK-owned process observer or hidden shell fallback.",
  ],
  createProvider: ({ provider, executor }) => provider ?? createHostExecutorShellExecutionMonitoringProvider(executor),
} as const satisfies ShellExecutionMonitoringProviderPractice;
