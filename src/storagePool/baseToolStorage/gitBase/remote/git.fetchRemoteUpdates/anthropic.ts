import type { GitFetchRemoteUpdatesProviderPractice } from "./dependencies.js";
import { createHostExecutorGitFetchRemoteUpdatesProvider } from "./dependencies.js";

export const anthropicGitFetchRemoteUpdatesPractice: GitFetchRemoteUpdatesProviderPractice = {
  providerName: "anthropic",
  source: {
    kind: "cli",
    label: "Claude Code git fetch practice through permissioned shell/tool execution",
  },
  directCliSupport: true,
  sideEffectPolicy: "remote-network",
  notes: [
    "Claude-style practice treats remote network Git operations as permissioned host actions.",
    "Praxis narrows that surface to fixed git fetch argv and keeps approval outside the baseTool.",
  ],
  createProvider: ({ provider, executor }) => provider ?? createHostExecutorGitFetchRemoteUpdatesProvider(executor),
};
