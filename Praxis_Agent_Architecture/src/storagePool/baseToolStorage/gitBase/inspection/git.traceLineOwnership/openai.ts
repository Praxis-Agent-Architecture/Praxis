import type { GitTraceLineOwnershipProviderPractice } from "./dependencies.js";
import { createHostExecutorGitTraceLineOwnershipProvider } from "./dependencies.js";

export const openaiGitTraceLineOwnershipPractice: GitTraceLineOwnershipProviderPractice = {
  providerName: "openai",
  source: {
    kind: "agent-sdk",
    label: "Codex-style sandboxed git blame through runtime-owned executor",
  },
  directCliSupport: true,
  sideEffectPolicy: "read-only",
  notes: [
    "Codex-style practice keeps process execution inside sandbox/runtime policy rather than model-authored commands.",
    "Praxis storage constructs fixed argv and the runtime owns the host git process.",
  ],
  createProvider: ({ provider, executor }) => provider ?? createHostExecutorGitTraceLineOwnershipProvider(executor),
};
