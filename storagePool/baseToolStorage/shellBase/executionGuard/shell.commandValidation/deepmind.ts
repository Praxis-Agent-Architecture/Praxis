import type { ShellCommandValidationProviderPractice } from "./dependencies.js";
import { createHostExecutorShellCommandValidationProvider } from "./dependencies.js";

export const deepmindShellCommandValidationPractice = {
  providerName: "deepmind",
  source: {
    kind: "cli",
    label: "Gemini CLI shell command confirmation practice",
  },
  directCliSupport: true,
  sideEffectPolicy: "runtime-governed",
  notes: ["Praxis records the provider practice source while keeping command validation provider-neutral."],
  createProvider: ({ provider, executor }) =>
    provider ?? createHostExecutorShellCommandValidationProvider(executor),
} as const satisfies ShellCommandValidationProviderPractice;
