import type { ShellSandboxEnforcementProviderPractice } from "./dependencies.js";
import { createHostExecutorShellSandboxEnforcementProvider } from "./dependencies.js";

export const anthropicShellSandboxEnforcementPractice = {
  providerName: "anthropic",
  source: {
    kind: "cli",
    label: "Claude Code BashTool sandbox and permission guard",
    path: "/home/proview/Desktop/three/claude_code_2_1_88/tools/BashTool",
  },
  directCliSupport: true,
  sideEffectPolicy: "runtime-governed",
  notes: ["Praxis checks sandbox envelope material; runtime owns actual sandboxing and process isolation."],
  createProvider: ({ provider, executor }) =>
    provider ?? createHostExecutorShellSandboxEnforcementProvider(executor),
} as const satisfies ShellSandboxEnforcementProviderPractice;
