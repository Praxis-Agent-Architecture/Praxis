import type { ShellProcessSpawningProviderPractice } from "./dependencies.js";
import { createHostExecutorShellProcessSpawningProvider } from "./dependencies.js";

export const openaiShellProcessSpawningPractice = {
  providerName: "openai",
  source: {
    kind: "cli",
    label: "Codex shell/process runtime boundary",
    path: "/home/proview/Desktop/three/codex_rust_0_123_0/codex-rs/core/src/tools",
  },
  directCliSupport: true,
  sideEffectPolicy: "runtime-governed",
  notes: [
    "Codex keeps shell/process execution in the host runtime while tool definitions describe call and result envelopes.",
    "Praxis baseTools keep approval, sandbox, session ownership, and process lifecycle policy in runtime/TAP.",
  ],
  createProvider: ({ provider, executor }) => provider ?? createHostExecutorShellProcessSpawningProvider(executor),
} as const satisfies ShellProcessSpawningProviderPractice;
