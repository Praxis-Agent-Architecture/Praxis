import type { CodeSearchRipgrepProviderPractice } from "./dependencies.js";
import { createHostExecutorCodeSearchRipgrepProvider } from "./dependencies.js";

export const deepmindCodeSearchRipgrepPractice = {
  providerName: "deepmind",
  source: {
    kind: "cli",
    label: "Gemini CLI 0.39.0 grep tool",
    path: "/home/proview/Desktop/three/gemini_cli_0_39_0/packages/core/src/tools/grep.ts",
  },
  directCliSupport: true,
  sideEffectPolicy: "read-only",
  notes: [
    "Gemini contributes include/exclude patterns, names-only modes, max match controls, and workspace validation.",
    "Praxis starts with structured matches and keeps output shaping in code.search_Ripgrep core.",
  ],
  createProvider: ({ provider, executor }) => provider ?? createHostExecutorCodeSearchRipgrepProvider(executor),
} as const satisfies CodeSearchRipgrepProviderPractice;
