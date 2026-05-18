import type { ShellPermissionControlProviderPractice } from "./dependencies.js";
import { createHostExecutorShellPermissionControlProvider } from "./dependencies.js";

export const anthropicShellPermissionControlPractice = {
  providerName: "anthropic",
  source: {
    kind: "cli",
    label: "Claude Code BashTool permission and approval gating",
    path: "/home/proview/Desktop/three/claude_code_2_1_88/tools/BashTool",
  },
  directCliSupport: true,
  sideEffectPolicy: "runtime-governed",
  notes: ["Praxis records permission decisions; TAP/runtime owns final approval and policy enforcement."],
  createProvider: ({ provider, executor }) =>
    provider ?? createHostExecutorShellPermissionControlProvider(executor),
} as const satisfies ShellPermissionControlProviderPractice;
