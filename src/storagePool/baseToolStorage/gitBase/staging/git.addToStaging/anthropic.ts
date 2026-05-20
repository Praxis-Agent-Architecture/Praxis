import type { GitAddToStagingProviderPractice } from "./dependencies.js";
import { createHostExecutorGitAddToStagingProvider } from "./dependencies.js";

export const anthropicGitAddToStagingPractice: GitAddToStagingProviderPractice = {
  providerName: "anthropic",
  source: {
    kind: "cli",
    label: "Claude Code git add practice through permissioned shell/tool execution",
  },
  directCliSupport: true,
  sideEffectPolicy: "workspace-mutation",
  notes: [
    "Claude-style practice treats git add as a write action behind explicit tool permission boundaries.",
    "Praxis keeps the model-facing surface narrow: this tool only builds fixed git add argv.",
  ],
  createProvider: ({ provider, executor }) => provider ?? createHostExecutorGitAddToStagingProvider(executor),
};
