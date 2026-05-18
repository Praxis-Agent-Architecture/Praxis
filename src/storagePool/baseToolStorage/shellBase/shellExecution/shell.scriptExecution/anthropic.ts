import type { ShellScriptExecutionProviderPractice } from "./dependencies.js";
import { createHostExecutorShellScriptExecutionProvider } from "./dependencies.js";

export const anthropicShellScriptExecutionPractice = {
  providerName: "anthropic",
  source: {
    kind: "cli",
    label: "Claude Code 2.1.88 BashTool script execution through governed shell calls",
    path: "/home/proview/Desktop/three/claude_code_2_1_88/tools/BashTool",
  },
  directCliSupport: true,
  sideEffectPolicy: "runtime-governed",
  notes: [
    "Claude Code treats scripts as shell tool work guarded by the host runtime.",
    "Praxis maps scripts into a shell executable plus args, then lets runtime execute or reject the call.",
  ],
  createProvider: ({ provider, executor }) =>
    provider ?? createHostExecutorShellScriptExecutionProvider(executor),
} as const satisfies ShellScriptExecutionProviderPractice;
