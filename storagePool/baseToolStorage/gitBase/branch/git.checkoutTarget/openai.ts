import type { GitCheckoutTargetProviderPractice } from "./dependencies.js";
import { createHostExecutorGitCheckoutTargetProvider } from "./dependencies.js";

export const openaiGitCheckoutTargetPractice: GitCheckoutTargetProviderPractice = {
  providerName: "openai",
  source: {
    kind: "cli",
    label: "Codex git checkout practice through sandboxed runtime executor ownership",
  },
  directCliSupport: true,
  sideEffectPolicy: "runtime-governed",
  notes: [
    "Codex-style practice keeps host process execution behind a runtime executor and sandbox policy.",
    "Praxis stores the checkout contract in gitBase while runtime owns the real git process.",
  ],
  createProvider: ({ provider, executor }) => provider ?? createHostExecutorGitCheckoutTargetProvider(executor),
};
