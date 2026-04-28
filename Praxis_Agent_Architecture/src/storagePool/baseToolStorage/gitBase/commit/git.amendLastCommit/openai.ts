import type { GitAmendLastCommitProviderPractice } from "./dependencies.js";
import { createHostExecutorGitAmendLastCommitProvider } from "./dependencies.js";

export const openaiGitAmendLastCommitPractice: GitAmendLastCommitProviderPractice = {
  providerName: "openai",
  source: {
    kind: "cli",
    label: "Codex git amend practice through sandboxed runtime executor ownership",
  },
  directCliSupport: true,
  sideEffectPolicy: "runtime-governed",
  notes: [
    "Codex-style practice keeps host process execution behind a runtime executor and sandbox policy.",
    "Praxis stores the amend-last-commit contract in gitBase while runtime owns the real git process.",
  ],
  createProvider: ({ provider, executor }) => provider ?? createHostExecutorGitAmendLastCommitProvider(executor),
};
