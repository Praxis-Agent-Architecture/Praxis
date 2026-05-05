import { createHostExecutorShellInvocationConstructionProvider, type ShellInvocationConstructionProviderPractice } from "./dependencies.js";

export const anthropicShellInvocationConstructionPractice = {
  providerName: "anthropic",
  source: {
    kind: "cli",
    label: "Claude Code BashTool invocation envelope before execution",
    path: "/home/proview/Desktop/three/claude_code_2_1_88/tools/BashTool",
  },
  directCliSupport: true,
  sideEffectPolicy: "runtime-governed",
  notes: [
    "Claude Code routes validated BashTool input through a central tool execution path.",
    "Praxis builds invocation envelopes after command generation and guard classification.",
  ],
  createProvider: ({ provider, executor }) => provider ?? createHostExecutorShellInvocationConstructionProvider(executor),
} as const satisfies ShellInvocationConstructionProviderPractice;
