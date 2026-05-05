import type { ShellProcessStatusTrackingProviderPractice } from "./dependencies.js";
import { createHostExecutorShellProcessStatusTrackingProvider } from "./dependencies.js";

export const anthropicShellProcessStatusTrackingPractice = {
  providerName: "anthropic",
  source: {
    kind: "cli",
    label: "Claude Code 2.1.88 BashTool process lifecycle observation",
    path: "/home/proview/Desktop/three/claude_code_2_1_88/tools/BashTool",
  },
  directCliSupport: true,
  sideEffectPolicy: "runtime-governed",
  notes: ["Claude Code leaves process ownership in the runtime shell tool boundary.", "Praxis normalizes runtime-supplied process snapshots without owning lifecycle policy."],
  createProvider: ({ provider, executor }) => provider ?? createHostExecutorShellProcessStatusTrackingProvider(executor),
} as const satisfies ShellProcessStatusTrackingProviderPractice;
