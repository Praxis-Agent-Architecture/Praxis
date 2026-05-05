import type { ShellCommandExecutionProviderPractice } from "./dependencies.js";
import { createHostExecutorShellCommandExecutionProvider } from "./dependencies.js";

export const openaiShellCommandExecutionPractice = {
  providerName: "openai",
  source: {
    kind: "cli",
    label: "Codex Rust 0.123.0 shell handler and runtime boundary",
    path: "/home/proview/Desktop/three/codex_rust_0_123_0/codex-rs/core/src/tools",
  },
  directCliSupport: true,
  sideEffectPolicy: "runtime-governed",
  notes: [
    "Codex separates tool routing from shell runtime backends.",
    "Praxis keeps that separation by requiring BaseToolExecutorPort.shell.run for real command dispatch.",
  ],
  createProvider: ({ provider, executor }) =>
    provider ?? createHostExecutorShellCommandExecutionProvider(executor),
} as const satisfies ShellCommandExecutionProviderPractice;
