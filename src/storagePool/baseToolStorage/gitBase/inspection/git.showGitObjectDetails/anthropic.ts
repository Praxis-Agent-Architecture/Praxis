import type { GitShowObjectDetailsProviderPractice } from "./dependencies.js";
import { createHostExecutorGitShowObjectDetailsProvider } from "./dependencies.js";

export const anthropicGitShowObjectDetailsPractice: GitShowObjectDetailsProviderPractice = {
  providerName: "anthropic",
  source: {
    kind: "cli",
    label: "Claude Code git show practice through permissioned shell/tool execution",
  },
  directCliSupport: true,
  sideEffectPolicy: "read-only",
  notes: [
    "Claude-style practice permits read-only git inspection behind explicit tool permission boundaries.",
    "Praxis narrows that surface to fixed git show argv for one object inspection action.",
  ],
  createProvider: ({ provider, executor }) => provider ?? createHostExecutorGitShowObjectDetailsProvider(executor),
};
