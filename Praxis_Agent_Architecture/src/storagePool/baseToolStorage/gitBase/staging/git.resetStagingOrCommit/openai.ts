import type { GitResetStagingOrCommitProviderPractice } from "./dependencies.js";
import { createHostExecutorGitResetStagingOrCommitProvider } from "./dependencies.js";

export const openaiGitResetStagingOrCommitPractice: GitResetStagingOrCommitProviderPractice = {
  providerName: "openai",
  source: {
    kind: "agent-sdk",
    label: "Codex-style sandboxed git reset through runtime-owned executor",
  },
  directCliSupport: true,
  sideEffectPolicy: "history-mutation",
  notes: [
    "Codex-style practice keeps host process execution inside sandbox/runtime policy rather than model-authored commands.",
    "Praxis storage constructs fixed reset argv and the runtime owns the host git process.",
  ],
  createProvider: ({ provider, executor }) => provider ?? createHostExecutorGitResetStagingOrCommitProvider(executor),
};
