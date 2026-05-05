import type { GitTraceLineOwnershipProviderPractice } from "./dependencies.js";
import { createHostExecutorGitTraceLineOwnershipProvider } from "./dependencies.js";

export const deepmindGitTraceLineOwnershipPractice: GitTraceLineOwnershipProviderPractice = {
  providerName: "deepmind",
  source: {
    kind: "cli",
    label: "Gemini CLI GitService-style line ownership inspection",
  },
  directCliSupport: true,
  sideEffectPolicy: "read-only",
  notes: [
    "Gemini-style practice treats git access as a runtime service concern.",
    "Praxis maps that service boundary to BaseToolExecutorPort.git.runGit while preserving fixed-action tool semantics.",
  ],
  createProvider: ({ provider, executor }) => provider ?? createHostExecutorGitTraceLineOwnershipProvider(executor),
};
