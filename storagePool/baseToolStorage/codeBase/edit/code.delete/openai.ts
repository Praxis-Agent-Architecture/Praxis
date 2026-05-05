import type { CodeDeleteProviderPractice } from "./dependencies.js";
import { createHostExecutorCodeDeleteProvider } from "./dependencies.js";

export const openaiCodeDeletePractice = {
  providerName: "openai",
  source: { kind: "cli", label: "Codex patch/delete-file practice", path: "/home/proview/Desktop/three/codex" },
  directCliSupport: true,
  sideEffectPolicy: "runtime-governed",
  notes: ["Delete intent should be represented as a governed edit action instead of shell rm.", "Praxis makes range deletion a storage-owned text transform."],
  createProvider: ({ provider, executor }) => provider ?? createHostExecutorCodeDeleteProvider(executor),
} as const satisfies CodeDeleteProviderPractice;
