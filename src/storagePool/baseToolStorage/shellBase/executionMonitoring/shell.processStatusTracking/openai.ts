import type { ShellProcessStatusTrackingProviderPractice } from "./dependencies.js";
import { createHostExecutorShellProcessStatusTrackingProvider } from "./dependencies.js";

export const openaiShellProcessStatusTrackingPractice = {
  providerName: "openai",
  source: {
    kind: "cli",
    label: "Codex Rust 0.123.0 shell process/result boundary",
    path: "/home/proview/Desktop/three/codex_rust_0_123_0/codex-rs/core/src/tools",
  },
  directCliSupport: true,
  sideEffectPolicy: "runtime-governed",
  notes: ["Codex separates shell tool routing from runtime-owned process state.", "Praxis requires BaseToolExecutorPort.shell.monitorExecution for live status snapshots."],
  createProvider: ({ provider, executor }) => provider ?? createHostExecutorShellProcessStatusTrackingProvider(executor),
} as const satisfies ShellProcessStatusTrackingProviderPractice;
