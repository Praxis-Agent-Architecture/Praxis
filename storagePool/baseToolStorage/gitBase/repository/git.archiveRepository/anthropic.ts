import type { GitArchiveRepositoryProviderPractice } from "./dependencies.js";
import { createHostExecutorGitArchiveRepositoryProvider } from "./dependencies.js";

export const anthropicGitArchiveRepositoryPractice: GitArchiveRepositoryProviderPractice = {
  providerName: "anthropic",
  source: {
    kind: "cli",
    label: "Claude Code git archive practice through permissioned shell/tool execution",
  },
  directCliSupport: true,
  sideEffectPolicy: "workspace-mutation",
  notes: [
    "Claude-style practice treats archive creation as a permissioned Git read plus filesystem write.",
    "Praxis narrows that surface to fixed git archive argv and keeps approval outside the baseTool.",
  ],
  createProvider: ({ provider, executor }) => provider ?? createHostExecutorGitArchiveRepositoryProvider(executor),
};
