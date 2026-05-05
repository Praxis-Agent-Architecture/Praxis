import type { ShellInteractiveControlProviderPractice } from "./dependencies.js";
import { createHostExecutorShellInteractiveControlProvider } from "./dependencies.js";

export const openaiShellInteractiveControlPractice = {
  providerName: "openai",
  source: { kind: "cli", label: "Codex shell tool routing keeps execution and terminal interaction in a governed host backend", path: "/home/proview/Desktop/three/codex_rust_0_123_0/codex-rs/core/src/tools" },
  directCliSupport: true,
  sideEffectPolicy: "runtime-governed",
  notes: [
    "Praxis baseTools shape and audit the request; runtime owns session/process policy and side effects.",
    "Provider dispatch is only used after context.dryRun is false and runtime governance is affirmative.",
    "This adapter is host-executor based; it does not claim an SDK-owned interactive control stream or hidden shell fallback.",
  ],
  createProvider: ({ provider, executor }) => provider ?? createHostExecutorShellInteractiveControlProvider(executor),
} as const satisfies ShellInteractiveControlProviderPractice;
