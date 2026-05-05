import { createRuntimeMicrophoneSelectProvider, type MicrophoneSelectProviderPractice } from "./dependencies.js";

export const openaiMicrophoneSelectPractice = {
  providerName: "openai",
  source: {
    kind: "cli",
    label: "Codex computer-use feature gate and runtime material handoff practice",
  },
  directCliSupport: true,
  sideEffectPolicy: "runtime-governed",
  notes: [
    "Codex computer-use style keeps host/device access behind an explicit runtime feature gate.",
    "Praxis preserves that boundary by exposing microphone selection as a runtime executor port, not a baseTool-owned OS operation.",
  ],
  createProvider: ({ provider, executor }) => provider ?? createRuntimeMicrophoneSelectProvider(executor),
} satisfies MicrophoneSelectProviderPractice;
