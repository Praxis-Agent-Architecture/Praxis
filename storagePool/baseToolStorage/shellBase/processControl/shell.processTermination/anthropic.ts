import type { ShellProcessTerminationProviderPractice } from "./dependencies.js";
import { createHostExecutorShellProcessTerminationProvider } from "./dependencies.js";

export const anthropicShellProcessTerminationPractice = {
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
  createProvider: ({ provider, executor }) => provider ?? createHostExecutorShellProcessTerminationProvider(executor),
} as const satisfies ShellProcessTerminationProviderPractice;
