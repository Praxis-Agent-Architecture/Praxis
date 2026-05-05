import type { ShellScriptExecutionProviderPractice } from "./dependencies.js";
import { createHostExecutorShellScriptExecutionProvider } from "./dependencies.js";

export const deepmindShellScriptExecutionPractice = {
  providerName: "deepmind",
  source: {
    kind: "cli",
    label: "Gemini CLI 0.39.0 shell tool command execution with confirmation policy",
    path: "/home/proview/Desktop/three/gemini_cli_0_39_0/packages/core/src/tools/shell.ts",
  },
  directCliSupport: true,
  sideEffectPolicy: "runtime-governed",
  notes: [
    "Gemini CLI contributes the confirmation and runtime shell routing pattern.",
    "Praxis does not embed confirmation policy here; runtime and TAP own that decision.",
  ],
  createProvider: ({ provider, executor }) =>
    provider ?? createHostExecutorShellScriptExecutionProvider(executor),
} as const satisfies ShellScriptExecutionProviderPractice;
