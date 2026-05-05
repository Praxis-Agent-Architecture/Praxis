import type { GitManageSubmoduleProviderPractice } from "./dependencies.js";
import { createHostExecutorGitManageSubmoduleProvider } from "./dependencies.js";

export const anthropicGitManageSubmodulePractice: GitManageSubmoduleProviderPractice = {
  providerName: "anthropic",
  source: {
    kind: "cli",
    label: "Claude Code git submodule practice through permissioned shell/tool execution",
  },
  directCliSupport: true,
  sideEffectPolicy: "workspace-mutation",
  notes: [
    "Claude-style practice treats submodule changes as permissioned Git operations.",
    "Praxis narrows that surface to fixed git submodule argv and keeps approval outside the baseTool.",
  ],
  createProvider: ({ provider, executor }) => provider ?? createHostExecutorGitManageSubmoduleProvider(executor),
};
