import type { ShellLifecycleManagementProviderPractice } from "./dependencies.js";
import { createHostExecutorShellLifecycleManagementProvider } from "./dependencies.js";

export const openaiShellLifecycleManagementPractice = {
  providerName: "openai",
  source: { kind: "cli", label: "Codex shell/session runtime boundary" },
  directCliSupport: true,
  sideEffectPolicy: "runtime-governed",
  notes: [
    "Codex keeps shell/session ownership in the host runtime while tool definitions describe safe call and result envelopes.",
    "Praxis baseTools never create, attach, suspend, resume, or close shell sessions without a runtime provider and guard.",
  ],
  createProvider: ({ provider, executor }) => provider ?? createHostExecutorShellLifecycleManagementProvider(executor),
} as const satisfies ShellLifecycleManagementProviderPractice;
