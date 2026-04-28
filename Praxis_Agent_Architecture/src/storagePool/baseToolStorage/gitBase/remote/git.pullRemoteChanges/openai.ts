import type { GitPullRemoteChangesProviderPractice } from "./dependencies.js";
import { createHostExecutorGitPullRemoteChangesProvider } from "./dependencies.js";

export const openaiGitPullRemoteChangesPractice: GitPullRemoteChangesProviderPractice = {
  providerName: "openai",
  source: {
    kind: "cli",
    label: "Codex git pull practice through sandboxed runtime executor ownership",
  },
  directCliSupport: true,
  sideEffectPolicy: "runtime-governed",
  notes: [
    "Codex-style practice keeps host process and network execution behind runtime policy.",
    "Praxis stores the pull contract in gitBase while runtime owns the real git process.",
  ],
  createProvider: ({ provider, executor }) => provider ?? createHostExecutorGitPullRemoteChangesProvider(executor),
};
