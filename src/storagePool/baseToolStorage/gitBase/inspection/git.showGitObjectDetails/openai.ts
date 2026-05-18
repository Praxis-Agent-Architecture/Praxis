import type { GitShowObjectDetailsProviderPractice } from "./dependencies.js";
import { createHostExecutorGitShowObjectDetailsProvider } from "./dependencies.js";

export const openaiGitShowObjectDetailsPractice: GitShowObjectDetailsProviderPractice = {
  providerName: "openai",
  source: {
    kind: "agent-sdk",
    label: "Codex-style sandboxed git show through runtime-owned executor",
  },
  directCliSupport: true,
  sideEffectPolicy: "read-only",
  notes: [
    "Codex-style practice keeps process execution inside sandbox/runtime policy rather than model-authored commands.",
    "Praxis storage constructs fixed argv and the runtime owns the host git process.",
  ],
  createProvider: ({ provider, executor }) => provider ?? createHostExecutorGitShowObjectDetailsProvider(executor),
};
