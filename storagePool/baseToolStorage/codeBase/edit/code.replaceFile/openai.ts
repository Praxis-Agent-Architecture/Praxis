import type { CodeReplaceFileProviderPractice } from "./dependencies.js";
import { createHostExecutorCodeReplaceFileProvider } from "./dependencies.js";

export const openaiCodeReplaceFilePractice = {
  providerName: "openai",
  source: { kind: "cli", label: "Codex apply_patch/fs_api write-boundary practice", path: "/home/proview/Desktop/three/codex" },
  directCliSupport: true,
  sideEffectPolicy: "runtime-governed",
  notes: ["Codex-style edits keep patch intent explicit and avoid hidden shell redirection.", "Praxis uses expected hash checks when the caller supplies one."],
  createProvider: ({ provider, executor }) => provider ?? createHostExecutorCodeReplaceFileProvider(executor),
} as const satisfies CodeReplaceFileProviderPractice;
