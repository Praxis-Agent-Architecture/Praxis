import type { ShellCommandValidationProviderPractice } from "./dependencies.js";
import { createHostExecutorShellCommandValidationProvider } from "./dependencies.js";

export const anthropicShellCommandValidationPractice = {
  providerName: "anthropic",
  source: {
    kind: "cli",
    label: "Claude Code BashTool command risk validation",
    path: "/home/proview/Desktop/three/claude_code_2_1_88/tools/BashTool",
  },
  directCliSupport: true,
  sideEffectPolicy: "runtime-governed",
  notes: ["Praxis validates command shape and risk signals; runtime/TAP owns final approval and execution."],
  createProvider: ({ provider, executor }) =>
    provider ?? createHostExecutorShellCommandValidationProvider(executor),
} as const satisfies ShellCommandValidationProviderPractice;
