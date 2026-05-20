import type { CodeReplaceFileProviderPractice } from "./dependencies.js";
import { createHostExecutorCodeReplaceFileProvider } from "./dependencies.js";

export const deepmindCodeReplaceFilePractice = {
  providerName: "deepmind",
  source: { kind: "cli", label: "Gemini CLI write-file/edit practice", path: "/home/proview/Desktop/three/gemini_cli_0_39_0/packages/core/src/tools" },
  directCliSupport: true,
  sideEffectPolicy: "runtime-governed",
  notes: ["Write-style tools should preserve path scope and caller-visible edit intent.", "Praxis maps that practice to storage-owned validation and runtime-owned text writes."],
  createProvider: ({ provider, executor }) => provider ?? createHostExecutorCodeReplaceFileProvider(executor),
} as const satisfies CodeReplaceFileProviderPractice;
