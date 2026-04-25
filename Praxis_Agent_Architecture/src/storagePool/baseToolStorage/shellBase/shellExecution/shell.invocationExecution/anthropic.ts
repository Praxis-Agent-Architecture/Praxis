import type { ShellInvocationExecutionProviderPractice } from "./dependencies.js";
import { createHostExecutorShellInvocationExecutionProvider } from "./dependencies.js";

export const anthropicShellInvocationExecutionPractice = {
  providerName: "anthropic",
  source: {
    kind: "cli",
    label: "Claude Code 2.1.88 BashTool invocation-to-shell execution boundary",
    path: "/home/proview/Desktop/three/claude_code_2_1_88/tools/BashTool",
  },
  directCliSupport: true,
  sideEffectPolicy: "runtime-governed",
  notes: [
    "Claude Code models shell work as governed tool invocations rather than raw process calls.",
    "Praxis keeps invocation object normalization in baseTools and delegates actual execution to runtime.",
  ],
  createProvider: ({ provider, executor }) =>
    provider ?? createHostExecutorShellInvocationExecutionProvider(executor),
} as const satisfies ShellInvocationExecutionProviderPractice;
