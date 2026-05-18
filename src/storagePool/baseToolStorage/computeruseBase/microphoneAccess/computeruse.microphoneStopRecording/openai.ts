import {
  createRuntimeMicrophoneStopRecordingProvider,
  type MicrophoneStopRecordingProviderPractice,
} from "./dependencies.js";

export const openaiMicrophoneStopRecordingPractice = {
  providerName: "openai",
  source: {
    kind: "cli",
    label: "Codex computer-use feature gate and media artifact handoff practice",
  },
  directCliSupport: true,
  sideEffectPolicy: "runtime-governed",
  notes: [
    "Codex computer-use style keeps host media access and artifacts behind runtime-controlled feature gates.",
    "Praxis preserves that boundary by exposing microphone recording stop as a runtime executor port, not a baseTool-owned media backend.",
  ],
  createProvider: ({ provider, executor }) => provider ?? createRuntimeMicrophoneStopRecordingProvider(executor),
} satisfies MicrophoneStopRecordingProviderPractice;
