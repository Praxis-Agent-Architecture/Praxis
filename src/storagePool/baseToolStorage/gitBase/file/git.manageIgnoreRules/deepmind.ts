import type { GitManageIgnoreRulesProviderPractice } from "./dependencies.js";
import { createHostExecutorGitManageIgnoreRulesProvider } from "./dependencies.js";

export const deepmindGitManageIgnoreRulesPractice: GitManageIgnoreRulesProviderPractice = {
  providerName: "deepmind",
  source: {
    kind: "cli",
    label: "Gemini CLI GitService/filesystem ownership pattern for ignore rule edits",
  },
  directCliSupport: false,
  sideEffectPolicy: "workspace-mutation",
  notes: [
    "Gemini-style practice separates model intent from runtime-owned repository/file service work.",
    "Praxis maps that to a fixed gitBase ignore-rule primitive with runtime filesystem read/write ports.",
  ],
  createProvider: ({ provider, executor }) => provider ?? createHostExecutorGitManageIgnoreRulesProvider(executor),
};
