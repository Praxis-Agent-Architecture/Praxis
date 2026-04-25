import type { ShellSessionManagementProviderPractice } from "./dependencies.js";
import { createHostExecutorShellSessionManagementProvider } from "./dependencies.js";

export const openaiShellSessionManagementPractice = {
  providerName: "openai",
  source: { kind: "cli", label: "Codex shell session runtime boundary" },
  directCliSupport: true,
  sideEffectPolicy: "runtime-governed",
  notes: ["Codex keeps shell session state in the host runtime.", "Praxis baseTools require guard plus provider before creating, attaching, detaching, or closing sessions."],
  createProvider: ({ provider, executor }) => provider ?? createHostExecutorShellSessionManagementProvider(executor),
} as const satisfies ShellSessionManagementProviderPractice;
