import type { ShellSessionManagementProviderPractice } from "./dependencies.js";
import { createHostExecutorShellSessionManagementProvider } from "./dependencies.js";

export const deepmindShellSessionManagementPractice = {
  providerName: "deepmind",
  source: { kind: "cli", label: "Gemini CLI shell session management boundary" },
  directCliSupport: true,
  sideEffectPolicy: "runtime-governed",
  notes: ["Runtime owns shell session state and attachment policy.", "Praxis mirrors that boundary with provider-only real execution."],
  createProvider: ({ provider, executor }) => provider ?? createHostExecutorShellSessionManagementProvider(executor),
} as const satisfies ShellSessionManagementProviderPractice;
