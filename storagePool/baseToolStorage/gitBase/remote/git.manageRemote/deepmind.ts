import type { GitManageRemoteProviderPractice } from "./dependencies.js";
import { createHostExecutorGitManageRemoteProvider } from "./dependencies.js";

export const deepmindGitManageRemotePractice: GitManageRemoteProviderPractice = {
  providerName: "deepmind",
  source: {
    kind: "cli",
    label: "Gemini CLI git remote practice with shell policy and repository ownership boundaries",
  },
  directCliSupport: true,
  sideEffectPolicy: "workspace-mutation",
  notes: [
    "Gemini-style practice keeps git effects inside shell policy and repository service ownership.",
    "Praxis translates that into a fixed git remote action rather than a generic git.execute surface.",
  ],
  createProvider: ({ provider, executor }) => provider ?? createHostExecutorGitManageRemoteProvider(executor),
};
