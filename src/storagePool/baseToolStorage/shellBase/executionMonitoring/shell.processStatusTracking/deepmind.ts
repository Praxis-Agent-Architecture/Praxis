import type { ShellProcessStatusTrackingProviderPractice } from "./dependencies.js";
import { createHostExecutorShellProcessStatusTrackingProvider } from "./dependencies.js";

export const deepmindShellProcessStatusTrackingPractice = {
  providerName: "deepmind",
  source: {
    kind: "cli",
    label: "Gemini CLI 0.39.0 shell process result practice",
    path: "/home/proview/Desktop/three/gemini_cli_0_39_0/packages/core/src/tools/shell.ts",
  },
  directCliSupport: true,
  sideEffectPolicy: "runtime-governed",
  notes: ["Gemini CLI confirms shell actions before runtime dispatch.", "Praxis keeps process state behind runtime governance and exposes only normalized status."],
  createProvider: ({ provider, executor }) => provider ?? createHostExecutorShellProcessStatusTrackingProvider(executor),
} as const satisfies ShellProcessStatusTrackingProviderPractice;
