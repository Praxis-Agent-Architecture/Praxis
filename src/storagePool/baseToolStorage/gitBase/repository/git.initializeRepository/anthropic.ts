import type { GitInitializeRepositoryProviderPractice } from "./dependencies.js";
import { createHostExecutorGitInitializeRepositoryProvider } from "./dependencies.js";

export const anthropicGitInitializeRepositoryPractice: GitInitializeRepositoryProviderPractice = {
  providerName: "anthropic",
  source: {
    kind: "cli",
    label: "Claude Code git init practice through permissioned shell/tool execution",
  },
  directCliSupport: true,
  sideEffectPolicy: "workspace-mutation",
  notes: [
    "Claude-style practice treats repository initialization as a permissioned filesystem and Git mutation.",
    "Praxis narrows that surface to fixed git init argv and keeps approval outside the baseTool.",
  ],
  createProvider: ({ provider, executor }) => provider ?? createHostExecutorGitInitializeRepositoryProvider(executor),
};
