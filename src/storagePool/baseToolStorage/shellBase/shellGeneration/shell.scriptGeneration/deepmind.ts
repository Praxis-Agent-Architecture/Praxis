import { createHostExecutorShellScriptGenerationProvider, type ShellScriptGenerationProviderPractice } from "./dependencies.js";

export const deepmindShellScriptGenerationPractice = {
  providerName: "deepmind",
  source: {
    kind: "cli",
    label: "Gemini CLI shell command wrapping and confirmation boundary",
    path: "/home/proview/Desktop/three/gemini_cli_0_39_0/packages/core/src/tools/shell.ts",
  },
  directCliSupport: true,
  sideEffectPolicy: "runtime-governed",
  notes: [
    "Gemini CLI wraps shell commands for lifecycle handling while keeping confirmation separate.",
    "Script generation remains pure and declares TAP approval needs in output.",
  ],
  createProvider: ({ provider, executor }) => provider ?? createHostExecutorShellScriptGenerationProvider(executor),
} as const satisfies ShellScriptGenerationProviderPractice;
