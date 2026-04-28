import type { CodeModifyProviderPractice } from "./dependencies.js";
import { createHostExecutorCodeModifyProvider } from "./dependencies.js";

export const anthropicCodeModifyPractice = {
  providerName: "anthropic",
  source: { kind: "cli", label: "Claude Code Edit tool practice", path: "/home/proview/Desktop/three/claude_code_2_1_88/tools" },
  directCliSupport: true,
  sideEffectPolicy: "runtime-governed",
  notes: ["Bounded text replacement should be explicit and permissioned.", "Provider reads/writes raw text only; storage owns first/all replacement semantics."],
  createProvider: ({ provider, executor }) => provider ?? createHostExecutorCodeModifyProvider(executor),
} as const satisfies CodeModifyProviderPractice;
