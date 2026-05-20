import type { ShellServiceStartAndVerifyProviderPractice } from "./dependencies.js";
import { createHostExecutorShellServiceStartAndVerifyProvider } from "./dependencies.js";

export const anthropicShellServiceStartAndVerifyPractice = {
  providerName: "anthropic",
  source: {
    kind: "cli",
    label: "Claude Code service launch and follow-up verification practice",
    path: "/home/proview/Desktop/three/claude_code_2_1_88/tools/BashTool",
  },
  directCliSupport: true,
  sideEffectPolicy: "runtime-governed",
  notes: [
    "Long-running services need a runtime-owned process handle plus an explicit reachability check before user-facing completion.",
    "Praxis baseTools keep approval, sandbox, session ownership, and process lifecycle policy in runtime/TAP.",
  ],
  createProvider: ({ provider, executor }) => provider ?? createHostExecutorShellServiceStartAndVerifyProvider(executor),
} as const satisfies ShellServiceStartAndVerifyProviderPractice;
