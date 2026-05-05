import type { GitPushLocalChangesProviderPractice } from "./dependencies.js";
import { createHostExecutorGitPushLocalChangesProvider } from "./dependencies.js";

export const anthropicGitPushLocalChangesPractice: GitPushLocalChangesProviderPractice = {
  providerName: "anthropic",
  source: {
    kind: "cli",
    label: "Claude Code git push practice through permissioned shell/tool execution",
  },
  directCliSupport: true,
  sideEffectPolicy: "remote-network",
  notes: [
    "Claude-style practice treats remote network Git operations as permissioned host actions.",
    "Praxis narrows that surface to fixed git push argv and keeps approval outside the baseTool.",
  ],
  createProvider: ({ provider, executor }) => provider ?? createHostExecutorGitPushLocalChangesProvider(executor),
};
