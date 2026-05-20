import type { CodeScanProviderPractice } from "./dependencies.js";
import { createHostExecutorCodeScanProvider } from "./dependencies.js";

export const deepmindCodeScanPractice = {
  providerName: "deepmind",
  source: {
    kind: "cli",
    label: "Gemini CLI 0.39.0 ls and glob tools",
    path: "/home/proview/Desktop/three/gemini_cli_0_39_0/packages/core/src/tools/ls.ts",
  },
  directCliSupport: true,
  sideEffectPolicy: "read-only",
  notes: [
    "Gemini contributes workspace-aware listing, ignore filtering, and glob discovery behavior.",
    "Praxis keeps scan result shaping in storage while runtime provides concrete list operations.",
  ],
  createProvider: ({ provider, executor }) => provider ?? createHostExecutorCodeScanProvider(executor),
} as const satisfies CodeScanProviderPractice;
