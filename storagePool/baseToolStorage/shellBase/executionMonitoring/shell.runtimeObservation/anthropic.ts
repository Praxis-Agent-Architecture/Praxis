import type { ShellRuntimeObservationProviderPractice } from "./dependencies.js";
import { createHostExecutorShellRuntimeObservationProvider } from "./dependencies.js";

export const anthropicShellRuntimeObservationPractice = {
  providerName: "anthropic",
  source: {
    kind: "cli",
    label: "Claude Code 2.1.88 BashTool runtime event observation",
    path: "/home/proview/Desktop/three/claude_code_2_1_88/tools/BashTool",
  },
  directCliSupport: true,
  sideEffectPolicy: "runtime-governed",
  notes: ["Claude Code surfaces shell execution progress through runtime-owned tool events.", "Praxis summarizes runtime-provided events without owning stream or session policy."],
  createProvider: ({ provider, executor }) => provider ?? createHostExecutorShellRuntimeObservationProvider(executor),
} as const satisfies ShellRuntimeObservationProviderPractice;
