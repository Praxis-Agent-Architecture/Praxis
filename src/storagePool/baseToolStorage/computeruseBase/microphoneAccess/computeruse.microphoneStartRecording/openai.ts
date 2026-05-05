import {
  createRuntimeMicrophoneStartRecordingProvider,
  type MicrophoneStartRecordingProviderPractice,
} from "./dependencies.js";

export const openaiMicrophoneStartRecordingPractice = {
  providerName: "openai",
  source: {
    kind: "cli",
    label: "Codex computer-use feature gate and media material handoff practice",
  },
  directCliSupport: true,
  sideEffectPolicy: "runtime-governed",
  notes: [
    "Codex computer-use style keeps host media access behind runtime-controlled feature gates.",
    "Praxis preserves that boundary by exposing microphone recording start as a runtime executor port, not a baseTool-owned media backend.",
  ],
  createProvider: ({ provider, executor }) => provider ?? createRuntimeMicrophoneStartRecordingProvider(executor),
} satisfies MicrophoneStartRecordingProviderPractice;
