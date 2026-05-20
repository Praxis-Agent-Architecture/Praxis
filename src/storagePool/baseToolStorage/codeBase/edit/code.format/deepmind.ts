import type { CodeFormatProviderPractice } from "./dependencies.js";
import { createHostExecutorCodeFormatProvider } from "./dependencies.js";

export const deepmindCodeFormatPractice = {
  providerName: "deepmind",
  source: { kind: "cli", label: "Gemini CLI formatting/edit practice", path: "/home/proview/Desktop/three/gemini_cli_0_39_0/packages/core/src/tools" },
  directCliSupport: false,
  sideEffectPolicy: "runtime-governed",
  notes: ["Formatter execution remains a runtime responsibility; storage owns the tool contract.", "Praxis keeps provider output as edits/formatted content and performs guarded write through runtime filesystem."],
  createProvider: ({ provider, executor }) => provider ?? createHostExecutorCodeFormatProvider(executor),
} as const satisfies CodeFormatProviderPractice;
