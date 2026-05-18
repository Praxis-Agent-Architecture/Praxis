import type { GitGetCommitHistoryProviderPractice } from "./dependencies.js";
import { createHostExecutorGitCommitHistoryProvider } from "./dependencies.js";

export const openaiGitCommitHistoryPractice: GitGetCommitHistoryProviderPractice = {
  providerName: "openai",
  source: {
    kind: "cli",
    label: "Codex git log practice through sandboxed runtime execution",
  },
  directCliSupport: true,
  sideEffectPolicy: "runtime-governed",
  notes: [
    "Codex-style practice keeps host process execution owned by the sandbox/runtime.",
    "The storage core owns the git log contract and parser.",
  ],
  createProvider: ({ provider, executor }) => provider ?? createHostExecutorGitCommitHistoryProvider(executor),
};
