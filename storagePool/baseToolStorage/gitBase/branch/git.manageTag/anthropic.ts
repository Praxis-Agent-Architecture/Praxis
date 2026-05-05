import type { GitManageTagProviderPractice } from "./dependencies.js";
import { createHostExecutorGitManageTagProvider } from "./dependencies.js";

export const anthropicGitManageTagPractice: GitManageTagProviderPractice = {
  providerName: "anthropic",
  source: {
    kind: "cli",
    label: "Claude Code git tag practice through permissioned shell/tool execution",
  },
  directCliSupport: true,
  sideEffectPolicy: "history-mutation",
  notes: [
    "Claude-style practice treats tag as a permissioned history mutation.",
    "Praxis narrows that surface to fixed git tag argv for list, create, annotate, and delete.",
  ],
  createProvider: ({ provider, executor }) => provider ?? createHostExecutorGitManageTagProvider(executor),
};
