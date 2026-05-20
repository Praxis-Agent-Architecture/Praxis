import type { GitManageSubmoduleProviderPractice } from "./dependencies.js";
import { createHostExecutorGitManageSubmoduleProvider } from "./dependencies.js";

export const openaiGitManageSubmodulePractice: GitManageSubmoduleProviderPractice = {
  providerName: "openai",
  source: {
    kind: "cli",
    label: "Codex git submodule practice through sandboxed runtime executor ownership",
  },
  directCliSupport: true,
  sideEffectPolicy: "runtime-governed",
  notes: [
    "Codex-style practice keeps host process execution behind a runtime executor and sandbox policy.",
    "Praxis stores the manage-submodule contract in gitBase while runtime owns the real git process.",
  ],
  createProvider: ({ provider, executor }) => provider ?? createHostExecutorGitManageSubmoduleProvider(executor),
};
