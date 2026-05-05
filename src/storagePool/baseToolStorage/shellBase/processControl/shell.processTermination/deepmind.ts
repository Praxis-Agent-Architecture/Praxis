import type { ShellProcessTerminationProviderPractice } from "./dependencies.js";
import { createHostExecutorShellProcessTerminationProvider } from "./dependencies.js";

export const deepmindShellProcessTerminationPractice = {
  providerName: "deepmind",
  source: {
    kind: "cli",
    label: "Gemini CLI shell/process practice",
    path: "/home/proview/Desktop/three/gemini_cli_0_39_0",
  },
  directCliSupport: true,
  sideEffectPolicy: "runtime-governed",
  notes: [
    "Gemini CLI-style practice keeps long-running shell lifecycle ownership outside model planning.",
    "Praxis baseTools keep approval, sandbox, session ownership, and process lifecycle policy in runtime/TAP.",
  ],
  createProvider: ({ provider, executor }) => provider ?? createHostExecutorShellProcessTerminationProvider(executor),
} as const satisfies ShellProcessTerminationProviderPractice;
