import type { GitCloneRepositoryProviderPractice } from "./dependencies.js";
import { createHostExecutorGitCloneRepositoryProvider } from "./dependencies.js";

export const openaiGitCloneRepositoryPractice: GitCloneRepositoryProviderPractice = {
  providerName: "openai",
  source: {
    kind: "cli",
    label: "Codex git clone practice through sandboxed runtime executor ownership",
  },
  directCliSupport: true,
  sideEffectPolicy: "runtime-governed",
  notes: [
    "Codex-style practice keeps host process execution behind a runtime executor and sandbox policy.",
    "Praxis stores the clone-repository contract in gitBase while runtime owns the real git process.",
  ],
  createProvider: ({ provider, executor }) => provider ?? createHostExecutorGitCloneRepositoryProvider(executor),
};
