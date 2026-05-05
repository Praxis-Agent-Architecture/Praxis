import type { GitManageTagProviderPractice } from "./dependencies.js";
import { createHostExecutorGitManageTagProvider } from "./dependencies.js";

export const deepmindGitManageTagPractice: GitManageTagProviderPractice = {
  providerName: "deepmind",
  source: {
    kind: "cli",
    label: "Gemini CLI git tag practice with shell policy and repository ownership boundaries",
  },
  directCliSupport: true,
  sideEffectPolicy: "history-mutation",
  notes: [
    "Gemini-style practice keeps git effects inside shell policy and repository service ownership.",
    "Praxis translates that into a fixed git tag action rather than a generic git.execute surface.",
  ],
  createProvider: ({ provider, executor }) => provider ?? createHostExecutorGitManageTagProvider(executor),
};
