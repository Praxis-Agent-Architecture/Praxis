import type { GitShowObjectDetailsProviderPractice } from "./dependencies.js";
import { createHostExecutorGitShowObjectDetailsProvider } from "./dependencies.js";

export const deepmindGitShowObjectDetailsPractice: GitShowObjectDetailsProviderPractice = {
  providerName: "deepmind",
  source: {
    kind: "cli",
    label: "Gemini CLI GitService-style read-only object inspection",
  },
  directCliSupport: true,
  sideEffectPolicy: "read-only",
  notes: [
    "Gemini-style practice treats git access as a runtime service concern.",
    "Praxis maps that service boundary to BaseToolExecutorPort.git.runGit while preserving fixed-action tool semantics.",
  ],
  createProvider: ({ provider, executor }) => provider ?? createHostExecutorGitShowObjectDetailsProvider(executor),
};
