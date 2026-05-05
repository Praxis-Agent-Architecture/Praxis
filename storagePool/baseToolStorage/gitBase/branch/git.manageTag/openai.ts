import type { GitManageTagProviderPractice } from "./dependencies.js";
import { createHostExecutorGitManageTagProvider } from "./dependencies.js";

export const openaiGitManageTagPractice: GitManageTagProviderPractice = {
  providerName: "openai",
  source: {
    kind: "cli",
    label: "Codex git tag practice through sandboxed runtime executor ownership",
  },
  directCliSupport: true,
  sideEffectPolicy: "runtime-governed",
  notes: [
    "Codex-style practice keeps host process execution behind a runtime executor and sandbox policy.",
    "Praxis stores the tag contract in gitBase while runtime owns the real git process.",
  ],
  createProvider: ({ provider, executor }) => provider ?? createHostExecutorGitManageTagProvider(executor),
};
