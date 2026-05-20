import type { ShellRuntimeObservationProviderPractice } from "./dependencies.js";
import { createHostExecutorShellRuntimeObservationProvider } from "./dependencies.js";

export const deepmindShellRuntimeObservationPractice = {
  providerName: "deepmind",
  source: {
    kind: "cli",
    label: "Gemini CLI 0.39.0 shell event handling",
    path: "/home/proview/Desktop/three/gemini_cli_0_39_0/packages/core/src/tools/shell.ts",
  },
  directCliSupport: true,
  sideEffectPolicy: "runtime-governed",
  notes: ["Gemini CLI contributes shell confirmation and event-result lessons.", "Praxis leaves event ownership in runtime and exposes a normalized observation summary."],
  createProvider: ({ provider, executor }) => provider ?? createHostExecutorShellRuntimeObservationProvider(executor),
} as const satisfies ShellRuntimeObservationProviderPractice;
