import type { GitTraceLineOwnershipProviderPractice } from "./dependencies.js";
import { createHostExecutorGitTraceLineOwnershipProvider } from "./dependencies.js";

export const anthropicGitTraceLineOwnershipPractice: GitTraceLineOwnershipProviderPractice = {
  providerName: "anthropic",
  source: {
    kind: "cli",
    label: "Claude Code git blame practice through permissioned shell/tool execution",
  },
  directCliSupport: true,
  sideEffectPolicy: "read-only",
  notes: [
    "Claude-style practice permits read-only git blame behind explicit tool permission boundaries.",
    "Praxis narrows that surface to fixed git blame argv for one file range.",
  ],
  createProvider: ({ provider, executor }) => provider ?? createHostExecutorGitTraceLineOwnershipProvider(executor),
};
