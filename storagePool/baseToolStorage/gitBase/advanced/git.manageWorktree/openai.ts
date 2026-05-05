import type { GitManageWorktreeProviderPractice } from "./dependencies.js";
import { createHostExecutorGitManageWorktreeProvider } from "./dependencies.js";

export const openaiGitManageWorktreePractice: GitManageWorktreeProviderPractice = {
  providerName: "openai",
  source: {
    kind: "cli",
    label: "Codex git worktree practice through sandboxed runtime executor ownership",
  },
  directCliSupport: true,
  sideEffectPolicy: "runtime-governed",
  notes: [
    "Codex-style practice keeps host process execution behind a runtime executor and sandbox policy.",
    "Praxis stores the manage-worktree contract in gitBase while runtime owns the real git process.",
  ],
  createProvider: ({ provider, executor }) => provider ?? createHostExecutorGitManageWorktreeProvider(executor),
};
