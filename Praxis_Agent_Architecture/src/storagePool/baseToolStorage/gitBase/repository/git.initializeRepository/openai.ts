import type { GitInitializeRepositoryProviderPractice } from "./dependencies.js";
import { createHostExecutorGitInitializeRepositoryProvider } from "./dependencies.js";

export const openaiGitInitializeRepositoryPractice: GitInitializeRepositoryProviderPractice = {
  providerName: "openai",
  source: {
    kind: "cli",
    label: "Codex git init practice through sandboxed runtime executor ownership",
  },
  directCliSupport: true,
  sideEffectPolicy: "runtime-governed",
  notes: [
    "Codex-style practice keeps host process execution behind a runtime executor and sandbox policy.",
    "Praxis stores the initialize-repository contract in gitBase while runtime owns the real git process.",
  ],
  createProvider: ({ provider, executor }) => provider ?? createHostExecutorGitInitializeRepositoryProvider(executor),
};
