import type { GitManageIgnoreRulesProviderPractice } from "./dependencies.js";
import { createHostExecutorGitManageIgnoreRulesProvider } from "./dependencies.js";

export const anthropicGitManageIgnoreRulesPractice: GitManageIgnoreRulesProviderPractice = {
  providerName: "anthropic",
  source: {
    kind: "cli",
    label: "Claude Code file-edit practice for ignore rule management",
  },
  directCliSupport: false,
  sideEffectPolicy: "workspace-mutation",
  notes: [
    "Claude-style practice treats ignore-file edits as governed filesystem writes, not arbitrary Git commands.",
    "Praxis keeps rule semantics in storage and delegates only read/write IO to runtime.",
  ],
  createProvider: ({ provider, executor }) => provider ?? createHostExecutorGitManageIgnoreRulesProvider(executor),
};
