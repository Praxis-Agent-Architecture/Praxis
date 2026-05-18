import { createHostExecutorShellCommandGenerationProvider, type ShellCommandGenerationProviderPractice } from "./dependencies.js";

export const anthropicShellCommandGenerationPractice = {
  providerName: "anthropic",
  source: {
    kind: "cli",
    label: "Claude Code BashTool command rendering and permission-facing command string",
    path: "/home/proview/Desktop/three/claude_code_2_1_88/tools/BashTool",
  },
  directCliSupport: true,
  sideEffectPolicy: "runtime-governed",
  notes: [
    "Claude Code keeps the command string as the permission and display surface for BashTool.",
    "Praxis renders command text for audit and handoff, not for hidden local execution.",
  ],
  createProvider: ({ provider, executor }) => provider ?? createHostExecutorShellCommandGenerationProvider(executor),
} as const satisfies ShellCommandGenerationProviderPractice;
