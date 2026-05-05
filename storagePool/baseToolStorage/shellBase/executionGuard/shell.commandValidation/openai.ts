import type { ShellCommandValidationProviderPractice } from "./dependencies.js";
import { createHostExecutorShellCommandValidationProvider } from "./dependencies.js";

export const openaiShellCommandValidationPractice = {
  providerName: "openai",
  source: {
    kind: "cli",
    label: "Codex shell command approval preview and risk boundary",
  },
  directCliSupport: true,
  sideEffectPolicy: "runtime-governed",
  notes: ["Command validation remains a dry-run guard primitive and never spawns a process."],
  createProvider: ({ provider, executor }) =>
    provider ?? createHostExecutorShellCommandValidationProvider(executor),
} as const satisfies ShellCommandValidationProviderPractice;
