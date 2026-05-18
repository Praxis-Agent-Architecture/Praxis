import type { ShellResourceManagementProviderPractice } from "./dependencies.js";
import { createHostExecutorShellResourceManagementProvider } from "./dependencies.js";

export const openaiShellResourceManagementPractice = {
  providerName: "openai",
  source: { kind: "cli", label: "Codex shell resource runtime boundary" },
  directCliSupport: true,
  sideEffectPolicy: "runtime-governed",
  notes: ["Codex keeps runtime resource accounting outside static tool definitions.", "Praxis only dispatches real resource changes through a guarded runtime provider."],
  createProvider: ({ provider, executor }) => provider ?? createHostExecutorShellResourceManagementProvider(executor),
} as const satisfies ShellResourceManagementProviderPractice;
