import type { ShellExitCodeCheckingProviderPractice } from "./dependencies.js";
import { createHostExecutorShellExitCodeCheckingProvider } from "./dependencies.js";

export const openaiShellExitCodeCheckingPractice = {
  providerName: "openai",
  source: {
    kind: "cli",
    label: "Codex Rust 0.123.0 shell execution result envelope",
    path: "/home/proview/Desktop/three/codex_rust_0_123_0/codex-rs/core/src/tools",
  },
  directCliSupport: true,
  sideEffectPolicy: "runtime-governed",
  notes: [
    "Codex reports shell exit material through a governed execution result envelope.",
    "Praxis mirrors that boundary by asking runtime for observations instead of probing the host process table.",
  ],
  createProvider: ({ provider, executor }) => provider ?? createHostExecutorShellExitCodeCheckingProvider(executor),
} as const satisfies ShellExitCodeCheckingProviderPractice;
