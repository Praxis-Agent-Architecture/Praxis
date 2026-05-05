import type { ShellLifecycleManagementProviderPractice } from "./dependencies.js";
import { createHostExecutorShellLifecycleManagementProvider } from "./dependencies.js";

export const anthropicShellLifecycleManagementPractice = {
  providerName: "anthropic",
  source: { kind: "cli", label: "Claude Code shell session lifecycle boundary" },
  directCliSupport: true,
  sideEffectPolicy: "runtime-governed",
  notes: [
    "Claude-style shell lifecycle is owned by the host runtime; baseTools expose the lifecycle request and audit envelope only.",
    "Praxis keeps approval, PTY/session handles, suspend/resume/close policy, and cleanup outside the baseTool core.",
  ],
  createProvider: ({ provider, executor }) => provider ?? createHostExecutorShellLifecycleManagementProvider(executor),
} as const satisfies ShellLifecycleManagementProviderPractice;
