import type { GitCheckoutTargetProviderPractice } from "./dependencies.js";
import { createHostExecutorGitCheckoutTargetProvider } from "./dependencies.js";

export const deepmindGitCheckoutTargetPractice: GitCheckoutTargetProviderPractice = {
  providerName: "deepmind",
  source: {
    kind: "cli",
    label: "Gemini CLI git checkout practice with shell policy and repository ownership boundaries",
  },
  directCliSupport: true,
  sideEffectPolicy: "workspace-mutation",
  notes: [
    "Gemini-style practice keeps git effects inside shell policy and repository service ownership.",
    "Praxis translates that into a fixed git checkout action rather than a generic git.execute surface.",
  ],
  createProvider: ({ provider, executor }) => provider ?? createHostExecutorGitCheckoutTargetProvider(executor),
};
