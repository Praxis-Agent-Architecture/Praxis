import type { CodeScanProviderPractice } from "./dependencies.js";
import { createHostExecutorCodeScanProvider } from "./dependencies.js";

export const anthropicCodeScanPractice = {
  providerName: "anthropic",
  source: {
    kind: "cli",
    label: "Claude Code 2.1.88 Glob and directory-discovery practice",
    path: "/home/proview/Desktop/three/claude_code_2_1_88/tools/GlobTool",
  },
  directCliSupport: true,
  sideEffectPolicy: "read-only",
  notes: [
    "Claude Code separates file discovery into named tools rather than requiring shell directory commands.",
    "Praxis keeps scan semantics in storage and only asks runtime for directory listing support.",
  ],
  createProvider: ({ provider, executor }) => provider ?? createHostExecutorCodeScanProvider(executor),
} as const satisfies CodeScanProviderPractice;
