import { createHostExecutorCodeTestProvider, type CodeTestProviderPractice } from "./dependencies.js";

export const deepmindCodeTestPractice: CodeTestProviderPractice = {
  providerName: "deepmind",
  source: {
    kind: "cli",
    label: "Gemini CLI command-tool separation practice",
  },
  directCliSupport: true,
  sideEffectPolicy: "runtime-governed",
  notes: [
    "Gemini-style command execution is translated into a fixed test primitive instead of an open command runner.",
    "Storage owns the test contract; runtime owns host process contact.",
  ],
  createProvider: ({ provider, executor }) => provider ?? createHostExecutorCodeTestProvider(executor),
};
