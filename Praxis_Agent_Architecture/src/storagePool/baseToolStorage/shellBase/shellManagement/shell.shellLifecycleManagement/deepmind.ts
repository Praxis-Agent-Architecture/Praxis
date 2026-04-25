import type { ShellLifecycleManagementProviderPractice } from "./dependencies.js";
import { createHostExecutorShellLifecycleManagementProvider } from "./dependencies.js";

export const deepmindShellLifecycleManagementPractice = {
  providerName: "deepmind",
  source: { kind: "cli", label: "Gemini CLI shell lifecycle boundary" },
  directCliSupport: true,
  sideEffectPolicy: "runtime-governed",
  notes: [
    "Gemini-style shell lifecycle behavior is mediated by the CLI/runtime rather than static tool files.",
    "Praxis mirrors that split by requiring runtime-owned shell lifecycle providers for real side effects.",
  ],
  createProvider: ({ provider, executor }) => provider ?? createHostExecutorShellLifecycleManagementProvider(executor),
} as const satisfies ShellLifecycleManagementProviderPractice;
