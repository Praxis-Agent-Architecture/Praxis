import type { GitMergeBranchProviderPractice } from "./dependencies.js";
import { createHostExecutorGitMergeBranchProvider } from "./dependencies.js";

export const openaiGitMergeBranchPractice: GitMergeBranchProviderPractice = {
  providerName: "openai",
  source: {
    kind: "cli",
    label: "Codex git merge practice through sandboxed runtime executor ownership",
  },
  directCliSupport: true,
  sideEffectPolicy: "runtime-governed",
  notes: [
    "Codex-style practice keeps host process execution behind a runtime executor and sandbox policy.",
    "Praxis stores the merge contract in gitBase while runtime owns the real git process.",
  ],
  createProvider: ({ provider, executor }) => provider ?? createHostExecutorGitMergeBranchProvider(executor),
};
