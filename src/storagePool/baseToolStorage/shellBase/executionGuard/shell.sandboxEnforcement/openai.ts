import type { ShellSandboxEnforcementProviderPractice } from "./dependencies.js";
import { createHostExecutorShellSandboxEnforcementProvider } from "./dependencies.js";

export const openaiShellSandboxEnforcementPractice = {
  providerName: "openai",
  source: {
    kind: "cli",
    label: "Codex workspace sandbox and approval boundary",
  },
  directCliSupport: true,
  sideEffectPolicy: "runtime-governed",
  notes: ["Sandbox enforcement emits a dry-run policy envelope and never performs host isolation itself."],
  createProvider: ({ provider, executor }) =>
    provider ?? createHostExecutorShellSandboxEnforcementProvider(executor),
} as const satisfies ShellSandboxEnforcementProviderPractice;
