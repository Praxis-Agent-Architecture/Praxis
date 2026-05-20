import type { ShellServiceStartAndVerifyProviderPractice } from "./dependencies.js";
import { createHostExecutorShellServiceStartAndVerifyProvider } from "./dependencies.js";

export const openaiShellServiceStartAndVerifyPractice = {
  providerName: "openai",
  source: {
    kind: "cli",
    label: "Codex service startup with evidence-backed verification practice",
    path: "/home/proview/Desktop/three/codex_rust_0_123_0/codex-rs/core/src/tools",
  },
  directCliSupport: true,
  sideEffectPolicy: "runtime-governed",
  notes: [
    "A successful process launch is not proof that a local web/API service is ready for the user.",
    "Praxis baseTools keep approval, sandbox, session ownership, and process lifecycle policy in runtime/TAP.",
  ],
  createProvider: ({ provider, executor }) => provider ?? createHostExecutorShellServiceStartAndVerifyProvider(executor),
} as const satisfies ShellServiceStartAndVerifyProviderPractice;
