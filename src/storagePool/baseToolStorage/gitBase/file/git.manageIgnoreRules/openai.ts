import type { GitManageIgnoreRulesProviderPractice } from "./dependencies.js";
import { createHostExecutorGitManageIgnoreRulesProvider } from "./dependencies.js";

export const openaiGitManageIgnoreRulesPractice: GitManageIgnoreRulesProviderPractice = {
  providerName: "openai",
  source: {
    kind: "cli",
    label: "Codex sandbox/runtime filesystem pattern for ignore rule edits",
  },
  directCliSupport: false,
  sideEffectPolicy: "workspace-mutation",
  notes: [
    "Codex-style practice keeps host file IO behind sandbox/runtime ownership.",
    "Praxis storage builds the ignore-rule patch and asks runtime filesystem ports to read/write text.",
  ],
  createProvider: ({ provider, executor }) => provider ?? createHostExecutorGitManageIgnoreRulesProvider(executor),
};
