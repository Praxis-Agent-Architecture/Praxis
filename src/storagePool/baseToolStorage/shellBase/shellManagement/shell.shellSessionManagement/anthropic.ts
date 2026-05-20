import type { ShellSessionManagementProviderPractice } from "./dependencies.js";
import { createHostExecutorShellSessionManagementProvider } from "./dependencies.js";

export const anthropicShellSessionManagementPractice = {
  providerName: "anthropic",
  source: { kind: "cli", label: "Claude Code shell session management boundary" },
  directCliSupport: true,
  sideEffectPolicy: "runtime-governed",
  notes: ["Shell sessions are runtime-owned handles, not baseTool-owned state.", "Praxis exposes session-management contracts and audit metadata only."],
  createProvider: ({ provider, executor }) => provider ?? createHostExecutorShellSessionManagementProvider(executor),
} as const satisfies ShellSessionManagementProviderPractice;
