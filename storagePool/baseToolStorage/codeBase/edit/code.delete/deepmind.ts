import type { CodeDeleteProviderPractice } from "./dependencies.js";
import { createHostExecutorCodeDeleteProvider } from "./dependencies.js";

export const deepmindCodeDeletePractice = {
  providerName: "deepmind",
  source: { kind: "cli", label: "Gemini CLI edit/delete practice", path: "/home/proview/Desktop/three/gemini_cli_0_39_0/packages/core/src/tools" },
  directCliSupport: false,
  sideEffectPolicy: "runtime-governed",
  notes: ["Deletion support should be explicit and approval-gated.", "Praxis delegates host deletion to runtime after storage validation."],
  createProvider: ({ provider, executor }) => provider ?? createHostExecutorCodeDeleteProvider(executor),
} as const satisfies CodeDeleteProviderPractice;
