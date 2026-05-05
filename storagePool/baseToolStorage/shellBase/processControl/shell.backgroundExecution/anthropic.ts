import type { ShellBackgroundExecutionProviderPractice } from "./dependencies.js";
import { createHostExecutorShellBackgroundExecutionProvider } from "./dependencies.js";

export const anthropicShellBackgroundExecutionPractice = {
  providerName: "anthropic",
  source: {
    kind: "cli",
    label: "Claude Code shell/process lifecycle practice",
    path: "/home/proview/Desktop/three/claude_code_2_1_88/tools/BashTool",
  },
  directCliSupport: true,
  sideEffectPolicy: "runtime-governed",
  notes: [
    "Claude Code keeps process side effects behind runtime tool governance and permission gates.",
    "Praxis baseTools keep approval, sandbox, session ownership, and process lifecycle policy in runtime/TAP.",
  ],
  createProvider: ({ provider, executor }) => provider ?? createHostExecutorShellBackgroundExecutionProvider(executor),
} as const satisfies ShellBackgroundExecutionProviderPractice;
