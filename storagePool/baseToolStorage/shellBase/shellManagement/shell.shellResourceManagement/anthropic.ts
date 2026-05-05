import type { ShellResourceManagementProviderPractice } from "./dependencies.js";
import { createHostExecutorShellResourceManagementProvider } from "./dependencies.js";

export const anthropicShellResourceManagementPractice = {
  providerName: "anthropic",
  source: { kind: "cli", label: "Claude Code shell resource management boundary" },
  directCliSupport: true,
  sideEffectPolicy: "runtime-governed",
  notes: ["Shell resource reservation and limits are runtime responsibilities.", "Praxis exposes resource envelopes while TAP/runtime owns enforcement."],
  createProvider: ({ provider, executor }) => provider ?? createHostExecutorShellResourceManagementProvider(executor),
} as const satisfies ShellResourceManagementProviderPractice;
