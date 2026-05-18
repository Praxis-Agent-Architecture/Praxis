import type { CodeOverwriteProviderPractice } from "./dependencies.js";
import { createHostExecutorCodeOverwriteProvider } from "./dependencies.js";

export const anthropicCodeOverwritePractice = {
  providerName: "anthropic",
  source: { kind: "cli", label: "Claude Code Write tool practice", path: "/home/proview/Desktop/three/claude_code_2_1_88/tools" },
  directCliSupport: true,
  sideEffectPolicy: "runtime-governed",
  notes: ["Whole-file writes require explicit content, scope, and approval boundaries.", "Runtime supplies text IO; storage owns size and hash checks."],
  createProvider: ({ provider, executor }) => provider ?? createHostExecutorCodeOverwriteProvider(executor),
} as const satisfies CodeOverwriteProviderPractice;
