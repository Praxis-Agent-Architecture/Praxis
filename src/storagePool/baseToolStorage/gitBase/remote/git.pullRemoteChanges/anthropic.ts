import type { GitPullRemoteChangesProviderPractice } from "./dependencies.js";
import { createHostExecutorGitPullRemoteChangesProvider } from "./dependencies.js";

export const anthropicGitPullRemoteChangesPractice: GitPullRemoteChangesProviderPractice = {
  providerName: "anthropic",
  source: {
    kind: "cli",
    label: "Claude Code git pull practice through permissioned shell/tool execution",
  },
  directCliSupport: true,
  sideEffectPolicy: "remote-network",
  notes: [
    "Claude-style practice treats remote network Git operations as permissioned host actions.",
    "Praxis narrows that surface to fixed git pull argv and keeps approval outside the baseTool.",
  ],
  createProvider: ({ provider, executor }) => provider ?? createHostExecutorGitPullRemoteChangesProvider(executor),
};
