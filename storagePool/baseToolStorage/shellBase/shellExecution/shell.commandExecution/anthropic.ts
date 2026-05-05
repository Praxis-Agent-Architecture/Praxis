import type { ShellCommandExecutionProviderPractice } from "./dependencies.js";
import { createHostExecutorShellCommandExecutionProvider } from "./dependencies.js";

export const anthropicShellCommandExecutionPractice = {
  providerName: "anthropic",
  source: {
    kind: "cli",
    label: "Claude Code 2.1.88 BashTool runtime-mediated shell execution",
    path: "/home/proview/Desktop/three/claude_code_2_1_88/tools/BashTool",
  },
  directCliSupport: true,
  sideEffectPolicy: "runtime-governed",
  notes: [
    "Claude Code keeps shell execution behind a tool execution and permission boundary.",
    "Praxis adopts the host executor boundary but keeps approval, sandbox, session, and process lifecycle in runtime.",
  ],
  createProvider: ({ provider, executor }) =>
    provider ?? createHostExecutorShellCommandExecutionProvider(executor),
} as const satisfies ShellCommandExecutionProviderPractice;
