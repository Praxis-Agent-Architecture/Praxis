import type { ShellProcessManagementProviderPractice } from "./dependencies.js";
import { createHostExecutorShellProcessManagementProvider } from "./dependencies.js";

export const openaiShellProcessManagementPractice = {
  providerName: "openai",
  source: { kind: "cli", label: "Codex shell process runtime boundary" },
  directCliSupport: true,
  sideEffectPolicy: "runtime-governed",
  notes: ["Codex keeps process signaling and lifecycle effects in the host runtime.", "Praxis requires a runtime guard and provider before real process management dispatch."],
  createProvider: ({ provider, executor }) => provider ?? createHostExecutorShellProcessManagementProvider(executor),
} as const satisfies ShellProcessManagementProviderPractice;
