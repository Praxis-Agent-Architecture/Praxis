import type { ShellCommandExecutionProviderPractice } from "./dependencies.js";
import { createHostExecutorShellCommandExecutionProvider } from "./dependencies.js";

export const deepmindShellCommandExecutionPractice = {
  providerName: "deepmind",
  source: {
    kind: "cli",
    label: "Gemini CLI 0.39.0 shell tool and confirmation policy",
    path: "/home/proview/Desktop/three/gemini_cli_0_39_0/packages/core/src/tools/shell.ts",
  },
  directCliSupport: true,
  sideEffectPolicy: "runtime-governed",
  notes: [
    "Gemini CLI contributes shell declaration and confirmation-flow lessons.",
    "Praxis keeps concrete execution behind runtime dependencies instead of embedding shell policy in baseTools.",
  ],
  createProvider: ({ provider, executor }) =>
    provider ?? createHostExecutorShellCommandExecutionProvider(executor),
} as const satisfies ShellCommandExecutionProviderPractice;
