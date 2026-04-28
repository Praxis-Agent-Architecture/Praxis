import type { GitCreateCommitProviderPractice } from "./dependencies.js";
import { createHostExecutorGitCreateCommitProvider } from "./dependencies.js";

export const openaiGitCreateCommitPractice: GitCreateCommitProviderPractice = {
  providerName: "openai",
  source: {
    kind: "cli",
    label: "Codex git commit practice through sandboxed runtime executor ownership",
  },
  directCliSupport: true,
  sideEffectPolicy: "runtime-governed",
  notes: [
    "Codex-style practice keeps host process execution behind a runtime executor and sandbox policy.",
    "Praxis stores the commit contract in gitBase while runtime owns the real git process.",
  ],
  createProvider: ({ provider, executor }) => provider ?? createHostExecutorGitCreateCommitProvider(executor),
};
