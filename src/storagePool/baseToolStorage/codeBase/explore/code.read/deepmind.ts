import type { CodeReadProviderPractice } from "./dependencies.js";
import { createHostExecutorCodeReadProvider } from "./dependencies.js";

export const deepmindCodeReadPractice = {
  providerName: "deepmind",
  source: {
    kind: "cli",
    label: "Gemini CLI 0.39.0 read-file and read-many-files tools",
    path: "/home/proview/Desktop/three/gemini_cli_0_39_0/packages/core/src/tools/read-file.ts",
  },
  directCliSupport: true,
  sideEffectPolicy: "read-only",
  notes: [
    "Gemini contributes start/end line reads, multi-file reading, ignore-aware file selection, and truncation guidance.",
    "Praxis keeps the multi-target contract in code.read storage while runtime provides the concrete text reads.",
  ],
  createProvider: ({ provider, executor }) => provider ?? createHostExecutorCodeReadProvider(executor),
} as const satisfies CodeReadProviderPractice;
