import type { ShellForegroundExecutionProviderPractice } from "./dependencies.js";
import { createHostExecutorShellForegroundExecutionProvider } from "./dependencies.js";

export const deepmindShellForegroundExecutionPractice = {
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
  createProvider: ({ provider, executor }) => provider ?? createHostExecutorShellForegroundExecutionProvider(executor),
} as const satisfies ShellForegroundExecutionProviderPractice;
