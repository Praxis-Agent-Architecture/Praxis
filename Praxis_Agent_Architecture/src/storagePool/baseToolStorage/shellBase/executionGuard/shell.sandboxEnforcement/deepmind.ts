import type { ShellSandboxEnforcementProviderPractice } from "./dependencies.js";
import { createHostExecutorShellSandboxEnforcementProvider } from "./dependencies.js";

export const deepmindShellSandboxEnforcementPractice = {
  providerName: "deepmind",
  source: {
    kind: "cli",
    label: "Gemini CLI sandbox and confirmation practice",
  },
  directCliSupport: true,
  sideEffectPolicy: "runtime-governed",
  notes: ["Provider practice metadata is audit context; sandbox policy remains runtime-owned."],
  createProvider: ({ provider, executor }) =>
    provider ?? createHostExecutorShellSandboxEnforcementProvider(executor),
} as const satisfies ShellSandboxEnforcementProviderPractice;
