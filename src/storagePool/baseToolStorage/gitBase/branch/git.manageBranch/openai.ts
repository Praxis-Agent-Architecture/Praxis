import type { GitManageBranchProviderPractice } from "./dependencies.js";
import { createHostExecutorGitManageBranchProvider } from "./dependencies.js";

export const openaiGitManageBranchPractice: GitManageBranchProviderPractice = {
  providerName: "openai",
  source: {
    kind: "cli",
    label: "Codex git branch practice through sandboxed runtime executor ownership",
  },
  directCliSupport: true,
  sideEffectPolicy: "runtime-governed",
  notes: [
    "Codex-style practice keeps host process execution behind a runtime executor and sandbox policy.",
    "Praxis stores the branch contract in gitBase while runtime owns the real git process.",
  ],
  createProvider: ({ provider, executor }) => provider ?? createHostExecutorGitManageBranchProvider(executor),
};
