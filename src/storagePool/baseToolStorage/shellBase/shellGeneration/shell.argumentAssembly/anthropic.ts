import { createHostExecutorShellArgumentAssemblyProvider, type ShellArgumentAssemblyProviderPractice } from "./dependencies.js";

export const anthropicShellArgumentAssemblyPractice = {
  providerName: "anthropic",
  source: {
    kind: "cli",
    label: "Claude Code BashTool argument construction before governed shell execution",
    path: "/home/proview/Desktop/three/claude_code_2_1_88/tools/BashTool",
  },
  directCliSupport: true,
  sideEffectPolicy: "runtime-governed",
  notes: [
    "Claude Code BashTool accepts command material as validated tool input before permission checks.",
    "Praxis keeps argument assembly pure; runtime/TAP still owns approval and execution.",
  ],
  createProvider: ({ provider, executor }) => provider ?? createHostExecutorShellArgumentAssemblyProvider(executor),
} as const satisfies ShellArgumentAssemblyProviderPractice;
