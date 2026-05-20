import type { GitStashChangesProviderPractice } from "./dependencies.js";
import { createHostExecutorGitStashChangesProvider } from "./dependencies.js";

export const openaiGitStashChangesPractice: GitStashChangesProviderPractice = {
  providerName: "openai",
  source: {
    kind: "agent-sdk",
    label: "Codex-style sandboxed git stash through runtime-owned executor",
  },
  directCliSupport: true,
  sideEffectPolicy: "workspace-mutation",
  notes: [
    "Codex-style practice keeps host process execution inside sandbox/runtime policy rather than model-authored commands.",
    "Praxis storage constructs fixed stash push argv and the runtime owns the host git process.",
  ],
  createProvider: ({ provider, executor }) => provider ?? createHostExecutorGitStashChangesProvider(executor),
};
