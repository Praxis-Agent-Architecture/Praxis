import type { ShellPermissionControlProviderPractice } from "./dependencies.js";
import { createHostExecutorShellPermissionControlProvider } from "./dependencies.js";

export const openaiShellPermissionControlPractice = {
  providerName: "openai",
  source: {
    kind: "cli",
    label: "Codex shell permission prompt and approval boundary",
  },
  directCliSupport: true,
  sideEffectPolicy: "runtime-governed",
  notes: ["Permission control emits a dry-run decision envelope and does not dispatch shell execution."],
  createProvider: ({ provider, executor }) =>
    provider ?? createHostExecutorShellPermissionControlProvider(executor),
} as const satisfies ShellPermissionControlProviderPractice;
