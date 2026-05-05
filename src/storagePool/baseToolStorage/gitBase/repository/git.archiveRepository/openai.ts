import type { GitArchiveRepositoryProviderPractice } from "./dependencies.js";
import { createHostExecutorGitArchiveRepositoryProvider } from "./dependencies.js";

export const openaiGitArchiveRepositoryPractice: GitArchiveRepositoryProviderPractice = {
  providerName: "openai",
  source: {
    kind: "cli",
    label: "Codex git archive practice through sandboxed runtime executor ownership",
  },
  directCliSupport: true,
  sideEffectPolicy: "runtime-governed",
  notes: [
    "Codex-style practice keeps host process execution behind a runtime executor and sandbox policy.",
    "Praxis stores the archive-repository contract in gitBase while runtime owns the real git process.",
  ],
  createProvider: ({ provider, executor }) => provider ?? createHostExecutorGitArchiveRepositoryProvider(executor),
};
