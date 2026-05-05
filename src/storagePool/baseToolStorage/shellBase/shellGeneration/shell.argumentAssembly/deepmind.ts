import { createHostExecutorShellArgumentAssemblyProvider, type ShellArgumentAssemblyProviderPractice } from "./dependencies.js";

export const deepmindShellArgumentAssemblyPractice = {
  providerName: "deepmind",
  source: {
    kind: "cli",
    label: "Gemini CLI shell-utils command roots and shell-quote handling",
    path: "/home/proview/Desktop/three/gemini_cli_0_39_0/packages/core/src/utils/shell-utils.ts",
  },
  directCliSupport: true,
  sideEffectPolicy: "runtime-governed",
  notes: [
    "Gemini CLI extracts command roots and normalizes command material before policy and execution.",
    "Praxis translates that preparation into a pure argv envelope.",
  ],
  createProvider: ({ provider, executor }) => provider ?? createHostExecutorShellArgumentAssemblyProvider(executor),
} as const satisfies ShellArgumentAssemblyProviderPractice;
