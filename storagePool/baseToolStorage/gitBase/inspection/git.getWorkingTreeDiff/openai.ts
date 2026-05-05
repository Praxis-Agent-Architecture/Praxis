import type { GitGetWorkingTreeDiffProviderPractice } from "./dependencies.js";
import { createHostExecutorGitWorkingTreeDiffProvider } from "./dependencies.js";

export const openaiGitWorkingTreeDiffPractice: GitGetWorkingTreeDiffProviderPractice = {
  providerName: "openai",
  source: {
    kind: "cli",
    label: "Codex git diff practice through sandboxed runtime execution",
  },
  directCliSupport: true,
  sideEffectPolicy: "runtime-governed",
  notes: [
    "Codex-style practice emphasizes sandbox/runtime ownership of host processes.",
    "The storage core constructs the fixed diff action while runtime owns the git binary.",
  ],
  createProvider: ({ provider, executor }) => provider ?? createHostExecutorGitWorkingTreeDiffProvider(executor),
};
