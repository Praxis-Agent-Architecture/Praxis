import type { GitManageRemoteProviderPractice } from "./dependencies.js";
import { createHostExecutorGitManageRemoteProvider } from "./dependencies.js";

export const openaiGitManageRemotePractice: GitManageRemoteProviderPractice = {
  providerName: "openai",
  source: {
    kind: "cli",
    label: "Codex git remote practice through sandboxed runtime executor ownership",
  },
  directCliSupport: true,
  sideEffectPolicy: "runtime-governed",
  notes: [
    "Codex-style practice keeps host process execution behind a runtime executor and sandbox policy.",
    "Praxis stores the manage-remote contract in gitBase while runtime owns the real git process.",
  ],
  createProvider: ({ provider, executor }) => provider ?? createHostExecutorGitManageRemoteProvider(executor),
};
