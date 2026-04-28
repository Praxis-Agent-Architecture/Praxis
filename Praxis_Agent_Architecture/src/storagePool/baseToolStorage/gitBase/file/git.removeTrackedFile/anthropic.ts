import type { GitRemoveTrackedFileProviderPractice } from "./dependencies.js";
import { createHostExecutorGitRemoveTrackedFileProvider } from "./dependencies.js";

export const anthropicGitRemoveTrackedFilePractice: GitRemoveTrackedFileProviderPractice = {
  providerName: "anthropic",
  source: {
    kind: "cli",
    label: "Claude Code git remove tracked file practice through permissioned shell/tool execution",
  },
  directCliSupport: true,
  sideEffectPolicy: "destructive",
  notes: [
    "Claude-style practice treats git rm as a write action behind explicit tool permission boundaries.",
    "Praxis narrows that surface to fixed git rm argv for one repository-relative tracked file path.",
  ],
  createProvider: ({ provider, executor }) => provider ?? createHostExecutorGitRemoveTrackedFileProvider(executor),
};
