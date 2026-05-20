import type { GitSwitchBranchProviderPractice } from "./dependencies.js";
import { createHostExecutorGitSwitchBranchProvider } from "./dependencies.js";

export const anthropicGitSwitchBranchPractice: GitSwitchBranchProviderPractice = {
  providerName: "anthropic",
  source: {
    kind: "cli",
    label: "Claude Code git switch practice through permissioned shell/tool execution",
  },
  directCliSupport: true,
  sideEffectPolicy: "workspace-mutation",
  notes: [
    "Claude-style practice treats branch switching as a permissioned workspace mutation.",
    "Praxis narrows that surface to fixed git switch argv and keeps approval at the runtime/TAP boundary.",
  ],
  createProvider: ({ provider, executor }) => provider ?? createHostExecutorGitSwitchBranchProvider(executor),
};
