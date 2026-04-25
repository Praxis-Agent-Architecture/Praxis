import type { ShellProcessManagementProviderPractice } from "./dependencies.js";
import { createHostExecutorShellProcessManagementProvider } from "./dependencies.js";

export const anthropicShellProcessManagementPractice = {
  providerName: "anthropic",
  source: { kind: "cli", label: "Claude Code shell process management boundary" },
  directCliSupport: true,
  sideEffectPolicy: "runtime-governed",
  notes: ["Shell process handles and signals stay in the host runtime.", "Praxis baseTools expose process-management contracts without owning process policy."],
  createProvider: ({ provider, executor }) => provider ?? createHostExecutorShellProcessManagementProvider(executor),
} as const satisfies ShellProcessManagementProviderPractice;
