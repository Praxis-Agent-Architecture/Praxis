import type { GitGetCommitHistoryProviderPractice } from "./dependencies.js";
import { createHostExecutorGitCommitHistoryProvider } from "./dependencies.js";

export const anthropicGitCommitHistoryPractice: GitGetCommitHistoryProviderPractice = {
  providerName: "anthropic",
  source: {
    kind: "cli",
    label: "Claude Code git log practice through permissioned shell/tool execution",
  },
  directCliSupport: true,
  sideEffectPolicy: "read-only",
  notes: [
    "Claude-style practice commonly reads commit history through governed tool execution.",
    "Praxis exposes this as fixed git log argv rather than a generic git command surface.",
  ],
  createProvider: ({ provider, executor }) => provider ?? createHostExecutorGitCommitHistoryProvider(executor),
};
