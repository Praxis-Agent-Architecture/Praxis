import type { CodeOverwriteProviderPractice } from "./dependencies.js";
import { createHostExecutorCodeOverwriteProvider } from "./dependencies.js";

export const deepmindCodeOverwritePractice = {
  providerName: "deepmind",
  source: { kind: "cli", label: "Gemini CLI write-file practice", path: "/home/proview/Desktop/three/gemini_cli_0_39_0/packages/core/src/tools" },
  directCliSupport: true,
  sideEffectPolicy: "runtime-governed",
  notes: ["Write-file practice supports explicit content and path-scope contracts.", "Praxis keeps overwrite approval and byte limits in storage core."],
  createProvider: ({ provider, executor }) => provider ?? createHostExecutorCodeOverwriteProvider(executor),
} as const satisfies CodeOverwriteProviderPractice;
