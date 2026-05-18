import type { GitCheckoutTargetProviderPractice } from "./dependencies.js";
import { createHostExecutorGitCheckoutTargetProvider } from "./dependencies.js";

export const anthropicGitCheckoutTargetPractice: GitCheckoutTargetProviderPractice = {
  providerName: "anthropic",
  source: {
    kind: "cli",
    label: "Claude Code git checkout practice through permissioned shell/tool execution",
  },
  directCliSupport: true,
  sideEffectPolicy: "workspace-mutation",
  notes: [
    "Claude-style practice treats checkout as a permissioned workspace mutation.",
    "Praxis narrows that surface to fixed git checkout argv for a safe target ref.",
  ],
  createProvider: ({ provider, executor }) => provider ?? createHostExecutorGitCheckoutTargetProvider(executor),
};
