import type { GitSwitchBranchProviderPractice } from "./dependencies.js";
import { createHostExecutorGitSwitchBranchProvider } from "./dependencies.js";

export const openaiGitSwitchBranchPractice: GitSwitchBranchProviderPractice = {
  providerName: "openai",
  source: {
    kind: "cli",
    label: "Codex git switch practice through sandboxed runtime executor ownership",
  },
  directCliSupport: true,
  sideEffectPolicy: "runtime-governed",
  notes: [
    "Codex-style practice keeps host process execution behind a runtime executor and sandbox policy.",
    "Praxis stores the fixed-action contract in gitBase while runtime owns the real git process.",
  ],
  createProvider: ({ provider, executor }) => provider ?? createHostExecutorGitSwitchBranchProvider(executor),
};
