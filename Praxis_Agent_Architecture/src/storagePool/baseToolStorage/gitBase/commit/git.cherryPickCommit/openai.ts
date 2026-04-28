import type { GitCherryPickCommitProviderPractice } from "./dependencies.js";
import { createHostExecutorGitCherryPickCommitProvider } from "./dependencies.js";

export const openaiGitCherryPickCommitPractice: GitCherryPickCommitProviderPractice = {
  providerName: "openai",
  source: {
    kind: "cli",
    label: "Codex git cherry-pick practice through sandboxed runtime executor ownership",
  },
  directCliSupport: true,
  sideEffectPolicy: "runtime-governed",
  notes: [
    "Codex-style practice keeps host process execution behind a runtime executor and sandbox policy.",
    "Praxis stores the cherry-pick-commit contract in gitBase while runtime owns the real git process.",
  ],
  createProvider: ({ provider, executor }) => provider ?? createHostExecutorGitCherryPickCommitProvider(executor),
};
