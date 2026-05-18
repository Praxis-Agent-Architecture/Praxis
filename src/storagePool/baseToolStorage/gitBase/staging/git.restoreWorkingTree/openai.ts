import type { GitRestoreWorkingTreeProviderPractice } from "./dependencies.js";
import { createHostExecutorGitRestoreWorkingTreeProvider } from "./dependencies.js";

export const openaiGitRestoreWorkingTreePractice: GitRestoreWorkingTreeProviderPractice = {
  providerName: "openai",
  source: {
    kind: "agent-sdk",
    label: "Codex-style sandboxed git restore through runtime-owned executor",
  },
  directCliSupport: true,
  sideEffectPolicy: "workspace-mutation",
  notes: [
    "Codex-style practice keeps host process execution inside sandbox/runtime policy rather than model-authored commands.",
    "Praxis storage constructs fixed restore argv and the runtime owns the host git process.",
  ],
  createProvider: ({ provider, executor }) => provider ?? createHostExecutorGitRestoreWorkingTreeProvider(executor),
};
