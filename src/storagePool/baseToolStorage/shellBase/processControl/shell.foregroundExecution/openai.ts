import type { ShellForegroundExecutionProviderPractice } from "./dependencies.js";
import { createHostExecutorShellForegroundExecutionProvider } from "./dependencies.js";

export const openaiShellForegroundExecutionPractice = {
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
  createProvider: ({ provider, executor }) => provider ?? createHostExecutorShellForegroundExecutionProvider(executor),
} as const satisfies ShellForegroundExecutionProviderPractice;
