import type { ShellServiceStartAndVerifyProviderPractice } from "./dependencies.js";
import { createHostExecutorShellServiceStartAndVerifyProvider } from "./dependencies.js";

export const deepmindShellServiceStartAndVerifyPractice = {
  providerName: "deepmind",
  source: {
    kind: "cli",
    label: "Gemini CLI-style service lifecycle verification practice",
    path: "/home/proview/Desktop/three/gemini_cli_0_39_0",
  },
  directCliSupport: true,
  sideEffectPolicy: "runtime-governed",
  notes: [
    "Service lifecycle tools should separate process state from verified user-facing reachability.",
    "Praxis baseTools keep approval, sandbox, session ownership, and process lifecycle policy in runtime/TAP.",
  ],
  createProvider: ({ provider, executor }) => provider ?? createHostExecutorShellServiceStartAndVerifyProvider(executor),
} as const satisfies ShellServiceStartAndVerifyProviderPractice;
