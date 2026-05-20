import type { ShellInvocationExecutionProviderPractice } from "./dependencies.js";
import { createHostExecutorShellInvocationExecutionProvider } from "./dependencies.js";

export const openaiShellInvocationExecutionPractice = {
  providerName: "openai",
  source: {
    kind: "cli",
    label: "Codex Rust 0.123.0 exec request routing into a governed shell backend",
    path: "/home/proview/Desktop/three/codex_rust_0_123_0/codex-rs/core/src/tools",
  },
  directCliSupport: true,
  sideEffectPolicy: "runtime-governed",
  notes: [
    "Codex separates model-visible tool requests from the host-side command executor.",
    "Praxis uses the same split: invocation objects are shaped here, while runtime owns execution policy.",
  ],
  createProvider: ({ provider, executor }) =>
    provider ?? createHostExecutorShellInvocationExecutionProvider(executor),
} as const satisfies ShellInvocationExecutionProviderPractice;
