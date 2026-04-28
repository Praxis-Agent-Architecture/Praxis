import type { CodeModifyProviderPractice } from "./dependencies.js";
import { createHostExecutorCodeModifyProvider } from "./dependencies.js";

export const deepmindCodeModifyPractice = {
  providerName: "deepmind",
  source: { kind: "cli", label: "Gemini CLI edit practice", path: "/home/proview/Desktop/three/gemini_cli_0_39_0/packages/core/src/tools" },
  directCliSupport: true,
  sideEffectPolicy: "runtime-governed",
  notes: ["Edit practice evidence supports scoped, reviewable text changes.", "Praxis storage owns match-count and max-replacement bounds."],
  createProvider: ({ provider, executor }) => provider ?? createHostExecutorCodeModifyProvider(executor),
} as const satisfies CodeModifyProviderPractice;
