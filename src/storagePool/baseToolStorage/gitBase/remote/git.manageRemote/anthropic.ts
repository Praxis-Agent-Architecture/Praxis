import type { GitManageRemoteProviderPractice } from "./dependencies.js";
import { createHostExecutorGitManageRemoteProvider } from "./dependencies.js";

export const anthropicGitManageRemotePractice: GitManageRemoteProviderPractice = {
  providerName: "anthropic",
  source: {
    kind: "cli",
    label: "Claude Code git remote practice through permissioned shell/tool execution",
  },
  directCliSupport: true,
  sideEffectPolicy: "workspace-mutation",
  notes: [
    "Claude-style practice treats remote config changes as permissioned Git operations.",
    "Praxis narrows that surface to fixed git remote argv and keeps approval outside the baseTool.",
  ],
  createProvider: ({ provider, executor }) => provider ?? createHostExecutorGitManageRemoteProvider(executor),
};
