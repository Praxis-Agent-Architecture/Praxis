import type { ShellScriptExecutionProviderPractice } from "./dependencies.js";
import { createHostExecutorShellScriptExecutionProvider } from "./dependencies.js";

export const openaiShellScriptExecutionPractice = {
  providerName: "openai",
  source: {
    kind: "cli",
    label: "Codex Rust 0.123.0 shell execution boundary for script-shaped commands",
    path: "/home/proview/Desktop/three/codex_rust_0_123_0/codex-rs/core/src/tools",
  },
  directCliSupport: true,
  sideEffectPolicy: "runtime-governed",
  notes: [
    "Codex keeps shell side effects behind a runtime executor rather than a model-visible local spawn.",
    "Praxis keeps script construction in this primitive and dispatches through BaseToolExecutorPort.shell.run.",
  ],
  createProvider: ({ provider, executor }) =>
    provider ?? createHostExecutorShellScriptExecutionProvider(executor),
} as const satisfies ShellScriptExecutionProviderPractice;
