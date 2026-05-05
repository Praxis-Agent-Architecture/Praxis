import { createHostExecutorShellScriptGenerationProvider, type ShellScriptGenerationProviderPractice } from "./dependencies.js";

export const anthropicShellScriptGenerationPractice = {
  providerName: "anthropic",
  source: {
    kind: "cli",
    label: "Claude Code shell script planning before governed BashTool execution",
    path: "/home/proview/Desktop/three/claude_code_2_1_88/tools/BashTool",
  },
  directCliSupport: true,
  sideEffectPolicy: "runtime-governed",
  notes: [
    "Claude Code BashTool prompt and helpers treat multi-step shell work as command material requiring review.",
    "Praxis creates script text only; execution remains a separate runtime-governed primitive.",
  ],
  createProvider: ({ provider, executor }) => provider ?? createHostExecutorShellScriptGenerationProvider(executor),
} as const satisfies ShellScriptGenerationProviderPractice;
