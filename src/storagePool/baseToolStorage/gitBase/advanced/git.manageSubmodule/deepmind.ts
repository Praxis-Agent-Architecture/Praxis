import type { GitManageSubmoduleProviderPractice } from "./dependencies.js";
import { createHostExecutorGitManageSubmoduleProvider } from "./dependencies.js";

export const deepmindGitManageSubmodulePractice: GitManageSubmoduleProviderPractice = {
  providerName: "deepmind",
  source: {
    kind: "cli",
    label: "Gemini CLI git submodule practice with shell policy and repository ownership boundaries",
  },
  directCliSupport: true,
  sideEffectPolicy: "workspace-mutation",
  notes: [
    "Gemini-style practice keeps git effects inside shell policy and repository service ownership.",
    "Praxis translates that into a fixed git submodule action rather than a generic git.execute surface.",
  ],
  createProvider: ({ provider, executor }) => provider ?? createHostExecutorGitManageSubmoduleProvider(executor),
};
