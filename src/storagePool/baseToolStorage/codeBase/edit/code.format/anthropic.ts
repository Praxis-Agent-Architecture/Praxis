import type { CodeFormatProviderPractice } from "./dependencies.js";
import { createHostExecutorCodeFormatProvider } from "./dependencies.js";

export const anthropicCodeFormatPractice = {
  providerName: "anthropic",
  source: { kind: "cli", label: "Claude Code edit-after-format practice", path: "/home/proview/Desktop/three/claude_code_2_1_88/tools" },
  directCliSupport: false,
  sideEffectPolicy: "runtime-governed",
  notes: ["Formatting should be represented as edit intent, not an untracked shell formatter run.", "Praxis asks runtime/LSP for preview edits and owns final write semantics."],
  createProvider: ({ provider, executor }) => provider ?? createHostExecutorCodeFormatProvider(executor),
} as const satisfies CodeFormatProviderPractice;
