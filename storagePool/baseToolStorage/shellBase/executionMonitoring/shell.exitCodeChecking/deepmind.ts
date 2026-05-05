import type { ShellExitCodeCheckingProviderPractice } from "./dependencies.js";
import { createHostExecutorShellExitCodeCheckingProvider } from "./dependencies.js";

export const deepmindShellExitCodeCheckingPractice = {
  providerName: "deepmind",
  source: {
    kind: "cli",
    label: "Gemini CLI 0.39.0 shell tool result handling",
    path: "/home/proview/Desktop/three/gemini_cli_0_39_0/packages/core/src/tools/shell.ts",
  },
  directCliSupport: true,
  sideEffectPolicy: "runtime-governed",
  notes: [
    "Gemini CLI contributes shell result and confirmation-flow lessons.",
    "Praxis keeps lifecycle and status ownership in runtime while this baseTool normalizes the exit classification.",
  ],
  createProvider: ({ provider, executor }) => provider ?? createHostExecutorShellExitCodeCheckingProvider(executor),
} as const satisfies ShellExitCodeCheckingProviderPractice;
