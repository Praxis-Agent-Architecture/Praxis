import type { CodeFormatProviderPractice } from "./dependencies.js";
import { createHostExecutorCodeFormatProvider } from "./dependencies.js";

export const openaiCodeFormatPractice = {
  providerName: "openai",
  source: { kind: "cli", label: "Codex formatter/apply_patch boundary practice", path: "/home/proview/Desktop/three/codex" },
  directCliSupport: false,
  sideEffectPolicy: "runtime-governed",
  notes: ["Formatter output should be applied through governed filesystem support.", "Praxis uses structured LSP preview edits instead of shelling out."],
  createProvider: ({ provider, executor }) => provider ?? createHostExecutorCodeFormatProvider(executor),
} as const satisfies CodeFormatProviderPractice;
