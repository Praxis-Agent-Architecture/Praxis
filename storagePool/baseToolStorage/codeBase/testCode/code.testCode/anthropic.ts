import { createHostExecutorCodeTestProvider, type CodeTestProviderPractice } from "./dependencies.js";

export const anthropicCodeTestPractice: CodeTestProviderPractice = {
  providerName: "anthropic",
  source: {
    kind: "cli",
    label: "Claude Code tool-first test execution practice",
  },
  directCliSupport: true,
  sideEffectPolicy: "runtime-governed",
  notes: [
    "Claude-style agents should call a fixed test tool rather than write arbitrary shell commands when a governed test primitive exists.",
    "Praxis keeps test target semantics in storage and delegates only bounded process execution to runtime.",
  ],
  createProvider: ({ provider, executor }) => provider ?? createHostExecutorCodeTestProvider(executor),
};
