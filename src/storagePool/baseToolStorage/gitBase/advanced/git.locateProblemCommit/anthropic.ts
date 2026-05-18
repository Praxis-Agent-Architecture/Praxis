import type { GitLocateProblemCommitProviderPractice } from "./dependencies.js";
import { createHostExecutorGitLocateProblemCommitProvider } from "./dependencies.js";

export const anthropicGitLocateProblemCommitPractice: GitLocateProblemCommitProviderPractice = {
  providerName: "anthropic",
  source: {
    kind: "cli",
    label: "Claude Code git history practice through permissioned shell/tool execution",
  },
  directCliSupport: true,
  sideEffectPolicy: "read-only-inspection",
  notes: [
    "Claude-style practice can inspect git history through permissioned commands.",
    "Praxis narrows this to fixed git rev-list argv and never executes the verification command inside the baseTool.",
  ],
  createProvider: ({ provider, executor }) => provider ?? createHostExecutorGitLocateProblemCommitProvider(executor),
};
