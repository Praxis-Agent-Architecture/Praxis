import { createHostExecutorShellExecutionGuardProvider, type ShellExecutionGuardProviderPractice } from "./dependencies.js";

export const anthropicShellExecutionGuardPractice = {
  providerName: "anthropic",
  source: {
    kind: "cli",
    label: "Claude Code shell permission and command risk guard",
    path: "/home/proview/Desktop/three/claude_code_2_1_88/tools/BashTool",
  },
  directCliSupport: true,
  sideEffectPolicy: "runtime-governed",
  notes: [
    "Claude Code separates command parsing, read-only checks, path checks, and permission prompts before BashTool execution.",
    "Praxis emits guard material only; TAP/runtime owns final approval, sandbox, and sudo policy.",
  ],
  createProvider: ({ provider, executor }) => provider ?? createHostExecutorShellExecutionGuardProvider(executor),
} as const satisfies ShellExecutionGuardProviderPractice;
