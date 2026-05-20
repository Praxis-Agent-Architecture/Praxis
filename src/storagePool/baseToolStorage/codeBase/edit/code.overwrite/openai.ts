import type { CodeOverwriteProviderPractice } from "./dependencies.js";
import { createHostExecutorCodeOverwriteProvider } from "./dependencies.js";

export const openaiCodeOverwritePractice = {
  providerName: "openai",
  source: { kind: "cli", label: "Codex fs_api/app-server filesystem boundary practice", path: "/home/proview/Desktop/three/codex" },
  directCliSupport: true,
  sideEffectPolicy: "runtime-governed",
  notes: ["Host writes should be runtime-owned, not hidden inside shell commands.", "Praxis avoids shell redirection and keeps output envelopes stable."],
  createProvider: ({ provider, executor }) => provider ?? createHostExecutorCodeOverwriteProvider(executor),
} as const satisfies CodeOverwriteProviderPractice;
