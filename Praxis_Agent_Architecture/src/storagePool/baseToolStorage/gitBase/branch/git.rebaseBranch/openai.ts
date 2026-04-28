import type { GitRebaseBranchProviderPractice } from "./dependencies.js";
import { createHostExecutorGitRebaseBranchProvider } from "./dependencies.js";

export const openaiGitRebaseBranchPractice: GitRebaseBranchProviderPractice = {
  providerName: "openai",
  source: {
    kind: "cli",
    label: "Codex git rebase practice through sandboxed runtime executor ownership",
  },
  directCliSupport: true,
  sideEffectPolicy: "runtime-governed",
  notes: [
    "Codex-style practice keeps host process execution behind a runtime executor and sandbox policy.",
    "Praxis stores the rebase contract in gitBase while runtime owns the real git process.",
  ],
  createProvider: ({ provider, executor }) => provider ?? createHostExecutorGitRebaseBranchProvider(executor),
};
