import type { CodeSearchRipgrepProviderPractice } from "./dependencies.js";
import { createHostExecutorCodeSearchRipgrepProvider } from "./dependencies.js";

export const anthropicCodeSearchRipgrepPractice = {
  providerName: "anthropic",
  source: {
    kind: "cli",
    label: "Claude Code 2.1.88 Grep tool practice",
    path: "/home/proview/Desktop/three/claude_code_2_1_88/tools/GrepTool",
  },
  directCliSupport: true,
  sideEffectPolicy: "read-only",
  notes: [
    "Claude Code explicitly routes search tasks through Grep instead of shell rg/grep commands.",
    "Praxis adopts that model by exposing code.search_Ripgrep as the model-facing precise search tool.",
  ],
  createProvider: ({ provider, executor }) => provider ?? createHostExecutorCodeSearchRipgrepProvider(executor),
} as const satisfies CodeSearchRipgrepProviderPractice;
