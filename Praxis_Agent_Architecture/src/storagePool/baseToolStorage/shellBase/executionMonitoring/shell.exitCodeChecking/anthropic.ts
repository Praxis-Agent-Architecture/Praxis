import type { ShellExitCodeCheckingProviderPractice } from "./dependencies.js";
import { createHostExecutorShellExitCodeCheckingProvider } from "./dependencies.js";

export const anthropicShellExitCodeCheckingPractice = {
  providerName: "anthropic",
  source: {
    kind: "cli",
    label: "Claude Code 2.1.88 BashTool post-execution status handling",
    path: "/home/proview/Desktop/three/claude_code_2_1_88/tools/BashTool",
  },
  directCliSupport: true,
  sideEffectPolicy: "runtime-governed",
  notes: [
    "Claude Code treats exit status as runtime-owned execution material.",
    "Praxis keeps exit observation behind the runtime monitorExecution port and classifies only supplied material.",
  ],
  createProvider: ({ provider, executor }) => provider ?? createHostExecutorShellExitCodeCheckingProvider(executor),
} as const satisfies ShellExitCodeCheckingProviderPractice;
