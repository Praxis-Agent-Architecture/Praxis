import type { GitRevertCommitProviderPractice } from "./dependencies.js";
import { createHostExecutorGitRevertCommitProvider } from "./dependencies.js";

export const openaiGitRevertCommitPractice: GitRevertCommitProviderPractice = {
  providerName: "openai",
  source: {
    kind: "cli",
    label: "Codex git revert practice through sandboxed runtime executor ownership",
  },
  directCliSupport: true,
  sideEffectPolicy: "runtime-governed",
  notes: [
    "Codex-style practice keeps host process execution behind a runtime executor and sandbox policy.",
    "Praxis stores the revert-commit contract in gitBase while runtime owns the real git process.",
  ],
  createProvider: ({ provider, executor }) => provider ?? createHostExecutorGitRevertCommitProvider(executor),
};
