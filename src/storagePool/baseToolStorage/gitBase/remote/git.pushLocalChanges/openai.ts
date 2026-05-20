import type { GitPushLocalChangesProviderPractice } from "./dependencies.js";
import { createHostExecutorGitPushLocalChangesProvider } from "./dependencies.js";

export const openaiGitPushLocalChangesPractice: GitPushLocalChangesProviderPractice = {
  providerName: "openai",
  source: {
    kind: "cli",
    label: "Codex git push practice through sandboxed runtime executor ownership",
  },
  directCliSupport: true,
  sideEffectPolicy: "runtime-governed",
  notes: [
    "Codex-style practice keeps host process and network execution behind runtime policy.",
    "Praxis stores the push contract in gitBase while runtime owns the real git process.",
  ],
  createProvider: ({ provider, executor }) => provider ?? createHostExecutorGitPushLocalChangesProvider(executor),
};
