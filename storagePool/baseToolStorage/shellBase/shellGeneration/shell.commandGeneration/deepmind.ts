import { createHostExecutorShellCommandGenerationProvider, type ShellCommandGenerationProviderPractice } from "./dependencies.js";

export const deepmindShellCommandGenerationPractice = {
  providerName: "deepmind",
  source: {
    kind: "cli",
    label: "Gemini CLI ShellToolInvocation description and contextual command details",
    path: "/home/proview/Desktop/three/gemini_cli_0_39_0/packages/core/src/tools/shell.ts",
  },
  directCliSupport: true,
  sideEffectPolicy: "runtime-governed",
  notes: [
    "Gemini CLI keeps command description/context separate from execution.",
    "Command rendering stays side-effect free and runtime-governed.",
  ],
  createProvider: ({ provider, executor }) => provider ?? createHostExecutorShellCommandGenerationProvider(executor),
} as const satisfies ShellCommandGenerationProviderPractice;
