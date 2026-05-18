import type { ShellRuntimeObservationProviderPractice } from "./dependencies.js";
import { createHostExecutorShellRuntimeObservationProvider } from "./dependencies.js";

export const openaiShellRuntimeObservationPractice = {
  providerName: "openai",
  source: {
    kind: "cli",
    label: "Codex Rust 0.123.0 shell event/result stream boundary",
    path: "/home/proview/Desktop/three/codex_rust_0_123_0/codex-rs/core/src/tools",
  },
  directCliSupport: true,
  sideEffectPolicy: "runtime-governed",
  notes: ["Codex keeps shell output and execution events behind runtime tool plumbing.", "Praxis follows that separation through BaseToolExecutorPort.shell.monitorExecution."],
  createProvider: ({ provider, executor }) => provider ?? createHostExecutorShellRuntimeObservationProvider(executor),
} as const satisfies ShellRuntimeObservationProviderPractice;
