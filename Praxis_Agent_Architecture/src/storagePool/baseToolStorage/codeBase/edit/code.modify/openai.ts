import type { CodeModifyProviderPractice } from "./dependencies.js";
import { createHostExecutorCodeModifyProvider } from "./dependencies.js";

export const openaiCodeModifyPractice = {
  providerName: "openai",
  source: { kind: "cli", label: "Codex apply_patch practice", path: "/home/proview/Desktop/three/codex" },
  directCliSupport: true,
  sideEffectPolicy: "runtime-governed",
  notes: ["Patch intent should be represented as structured tool arguments instead of shell text rewrites.", "Praxis converts bounded replacement to final content before runtime write."],
  createProvider: ({ provider, executor }) => provider ?? createHostExecutorCodeModifyProvider(executor),
} as const satisfies CodeModifyProviderPractice;
