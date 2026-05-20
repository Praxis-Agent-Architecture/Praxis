import type { GitGetWorkingTreeDiffProviderPractice } from "./dependencies.js";
import { createHostExecutorGitWorkingTreeDiffProvider } from "./dependencies.js";

export const anthropicGitWorkingTreeDiffPractice: GitGetWorkingTreeDiffProviderPractice = {
  providerName: "anthropic",
  source: {
    kind: "cli",
    label: "Claude Code git diff practice through permissioned shell/tool execution",
  },
  directCliSupport: true,
  sideEffectPolicy: "read-only",
  notes: [
    "Claude-style practice allows read-only git inspection behind explicit tool permission boundaries.",
    "Praxis keeps the model-facing surface narrow: this tool only builds fixed git diff argv.",
  ],
  createProvider: ({ provider, executor }) => provider ?? createHostExecutorGitWorkingTreeDiffProvider(executor),
};
