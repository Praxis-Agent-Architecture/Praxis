import type { GitGetCommitHistoryProviderPractice } from "./dependencies.js";
import { createHostExecutorGitCommitHistoryProvider } from "./dependencies.js";

export const deepmindGitCommitHistoryPractice: GitGetCommitHistoryProviderPractice = {
  providerName: "deepmind",
  source: {
    kind: "cli",
    label: "Gemini CLI commit history practice through shell policy and repository service boundaries",
  },
  directCliSupport: true,
  sideEffectPolicy: "runtime-governed",
  notes: [
    "Gemini-style practice treats repository reads as governed host capabilities.",
    "Praxis maps that to fixed-action gitBase plus runtime git executor.",
  ],
  createProvider: ({ provider, executor }) => provider ?? createHostExecutorGitCommitHistoryProvider(executor),
};
