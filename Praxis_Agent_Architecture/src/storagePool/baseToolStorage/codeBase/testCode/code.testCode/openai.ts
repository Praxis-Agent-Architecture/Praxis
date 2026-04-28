import { createHostExecutorCodeTestProvider, type CodeTestProviderPractice } from "./dependencies.js";

export const openaiCodeTestPractice: CodeTestProviderPractice = {
  providerName: "openai",
  source: {
    kind: "cli",
    label: "Codex fixed-tool schema practice",
  },
  directCliSupport: true,
  sideEffectPolicy: "runtime-governed",
  notes: [
    "Codex-style usage benefits from a precise JSON schema for test targets, timeout, command, and guard.",
    "The model should request code.testCode; runtime owns process execution and cleanup.",
  ],
  createProvider: ({ provider, executor }) => provider ?? createHostExecutorCodeTestProvider(executor),
};
