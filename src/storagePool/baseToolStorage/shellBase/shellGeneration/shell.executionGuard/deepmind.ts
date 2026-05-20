import { createHostExecutorShellExecutionGuardProvider, type ShellExecutionGuardProviderPractice } from "./dependencies.js";

export const deepmindShellExecutionGuardPractice = {
  providerName: "deepmind",
  source: {
    kind: "cli",
    label: "Gemini CLI ShellToolInvocation confirmation and policy update",
    path: "/home/proview/Desktop/three/gemini_cli_0_39_0/packages/core/src/tools/shell.ts",
  },
  directCliSupport: true,
  sideEffectPolicy: "runtime-governed",
  notes: [
    "Gemini CLI extracts command roots, redirection, and confirmation details before execution.",
    "Praxis keeps this as a side-effect-free guard envelope.",
  ],
  createProvider: ({ provider, executor }) => provider ?? createHostExecutorShellExecutionGuardProvider(executor),
} as const satisfies ShellExecutionGuardProviderPractice;
