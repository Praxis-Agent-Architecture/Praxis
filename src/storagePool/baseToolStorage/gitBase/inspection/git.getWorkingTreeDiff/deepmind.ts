import type { GitGetWorkingTreeDiffProviderPractice } from "./dependencies.js";
import { createHostExecutorGitWorkingTreeDiffProvider } from "./dependencies.js";

export const deepmindGitWorkingTreeDiffPractice: GitGetWorkingTreeDiffProviderPractice = {
  providerName: "deepmind",
  source: {
    kind: "cli",
    label: "Gemini CLI git diff practice through shell policy and repository service boundaries",
  },
  directCliSupport: true,
  sideEffectPolicy: "runtime-governed",
  notes: [
    "Gemini-style practice treats shell and repository operations as policy-governed host capabilities.",
    "Praxis translates that into a fixed-action gitBase tool plus runtime git executor.",
  ],
  createProvider: ({ provider, executor }) => provider ?? createHostExecutorGitWorkingTreeDiffProvider(executor),
};
