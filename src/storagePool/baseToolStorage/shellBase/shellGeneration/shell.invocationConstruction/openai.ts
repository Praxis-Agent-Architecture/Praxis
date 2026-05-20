import { createHostExecutorShellInvocationConstructionProvider, type ShellInvocationConstructionProviderPractice } from "./dependencies.js";

export const openaiShellInvocationConstructionPractice = {
  providerName: "openai",
  source: {
    kind: "cli",
    label: "Codex ToolInvocation payload and shell handler ExecParams construction",
    path: "/home/proview/Desktop/three/codex_rust_0_123_0/codex-rs/core/src/tools/handlers/shell.rs",
  },
  directCliSupport: true,
  sideEffectPolicy: "runtime-governed",
  notes: [
    "Codex separates tool invocation payload from runtime ExecParams construction.",
    "Invocation construction records audit-ready handoff material without executing it.",
  ],
  createProvider: ({ provider, executor }) => provider ?? createHostExecutorShellInvocationConstructionProvider(executor),
} as const satisfies ShellInvocationConstructionProviderPractice;
