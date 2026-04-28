import type { GitCleanUntrackedFilesProviderPractice } from "./dependencies.js";
import { createHostExecutorGitCleanUntrackedFilesProvider } from "./dependencies.js";

export const anthropicGitCleanUntrackedFilesPractice: GitCleanUntrackedFilesProviderPractice = {
  providerName: "anthropic",
  source: {
    kind: "cli",
    label: "Claude Code git clean untracked practice through permissioned shell/tool execution",
  },
  directCliSupport: true,
  sideEffectPolicy: "destructive",
  notes: [
    "Claude-style practice treats git clean as a destructive write action behind explicit tool permission boundaries.",
    "Praxis narrows that surface to fixed git clean argv for repository-relative path filters.",
  ],
  createProvider: ({ provider, executor }) => provider ?? createHostExecutorGitCleanUntrackedFilesProvider(executor),
};
