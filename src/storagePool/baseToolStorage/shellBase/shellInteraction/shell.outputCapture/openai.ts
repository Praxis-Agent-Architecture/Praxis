import type { ShellOutputCaptureProviderPractice } from "./dependencies.js";
import { createHostExecutorShellOutputCaptureProvider } from "./dependencies.js";

export const openaiShellOutputCapturePractice = {
  providerName: "openai",
  source: { kind: "cli", label: "Codex shell tool routing keeps execution and terminal interaction in a governed host backend", path: "/home/proview/Desktop/three/codex_rust_0_123_0/codex-rs/core/src/tools" },
  directCliSupport: true,
  sideEffectPolicy: "runtime-governed",
  notes: [
    "Praxis baseTools shape and audit the request; runtime owns session/process policy and side effects.",
    "Provider dispatch is only used after context.dryRun is false and runtime governance is affirmative.",
    "This adapter is host-executor based; it does not claim an SDK-owned output stream or hidden shell fallback.",
  ],
  createProvider: ({ provider, executor }) => provider ?? createHostExecutorShellOutputCaptureProvider(executor),
} as const satisfies ShellOutputCaptureProviderPractice;
