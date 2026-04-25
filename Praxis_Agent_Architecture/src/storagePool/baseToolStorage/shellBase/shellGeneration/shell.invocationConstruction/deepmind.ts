import { createHostExecutorShellInvocationConstructionProvider, type ShellInvocationConstructionProviderPractice } from "./dependencies.js";

export const deepmindShellInvocationConstructionPractice = {
  providerName: "deepmind",
  source: {
    kind: "cli",
    label: "Gemini CLI ShellToolInvocation object before ShellExecutionService call",
    path: "/home/proview/Desktop/three/gemini_cli_0_39_0/packages/core/src/tools/shell.ts",
  },
  directCliSupport: true,
  sideEffectPolicy: "runtime-governed",
  notes: [
    "Gemini CLI holds command params in an invocation object before confirmation and execution.",
    "Praxis invocation envelopes stay dry-run until a separate execution tool is invoked.",
  ],
  createProvider: ({ provider, executor }) => provider ?? createHostExecutorShellInvocationConstructionProvider(executor),
} as const satisfies ShellInvocationConstructionProviderPractice;
