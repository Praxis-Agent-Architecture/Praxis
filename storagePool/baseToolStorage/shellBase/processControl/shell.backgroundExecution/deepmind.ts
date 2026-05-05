import type { ShellBackgroundExecutionProviderPractice } from "./dependencies.js";
import { createHostExecutorShellBackgroundExecutionProvider } from "./dependencies.js";

export const deepmindShellBackgroundExecutionPractice = {
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
  createProvider: ({ provider, executor }) => provider ?? createHostExecutorShellBackgroundExecutionProvider(executor),
} as const satisfies ShellBackgroundExecutionProviderPractice;
