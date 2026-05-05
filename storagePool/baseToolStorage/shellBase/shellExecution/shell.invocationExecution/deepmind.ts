import type { ShellInvocationExecutionProviderPractice } from "./dependencies.js";
import { createHostExecutorShellInvocationExecutionProvider } from "./dependencies.js";

export const deepmindShellInvocationExecutionPractice = {
  providerName: "deepmind",
  source: {
    kind: "cli",
    label: "Gemini CLI 0.39.0 shell tool request and confirmation pattern",
    path: "/home/proview/Desktop/three/gemini_cli_0_39_0/packages/core/src/tools/shell.ts",
  },
  directCliSupport: true,
  sideEffectPolicy: "runtime-governed",
  notes: [
    "Gemini CLI contributes confirmation and shell-tool routing practice.",
    "Praxis adapts that practice through a shared runtime shell executor instead of embedding policy locally.",
  ],
  createProvider: ({ provider, executor }) =>
    provider ?? createHostExecutorShellInvocationExecutionProvider(executor),
} as const satisfies ShellInvocationExecutionProviderPractice;
