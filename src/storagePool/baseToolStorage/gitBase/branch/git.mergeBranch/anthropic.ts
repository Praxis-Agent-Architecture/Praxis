import type { GitMergeBranchProviderPractice } from "./dependencies.js";
import { createHostExecutorGitMergeBranchProvider } from "./dependencies.js";

export const anthropicGitMergeBranchPractice: GitMergeBranchProviderPractice = {
  providerName: "anthropic",
  source: {
    kind: "cli",
    label: "Claude Code git merge practice through permissioned shell/tool execution",
  },
  directCliSupport: true,
  sideEffectPolicy: "workspace-mutation",
  notes: [
    "Claude-style practice treats merge as a permissioned repository mutation.",
    "Praxis narrows that surface to fixed git merge argv for a safe source branch.",
  ],
  createProvider: ({ provider, executor }) => provider ?? createHostExecutorGitMergeBranchProvider(executor),
};
