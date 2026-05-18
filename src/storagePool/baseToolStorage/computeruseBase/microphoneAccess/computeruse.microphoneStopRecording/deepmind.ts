import {
  createRuntimeMicrophoneStopRecordingProvider,
  type MicrophoneStopRecordingProviderPractice,
} from "./dependencies.js";

export const deepmindMicrophoneStopRecordingPractice = {
  providerName: "deepmind",
  source: {
    kind: "cli",
    label: "Gemini CLI media permission and recording artifact handling practice",
  },
  directCliSupport: false,
  sideEffectPolicy: "runtime-governed",
  notes: [
    "Gemini-style media workflows treat captured audio artifacts and provider analysis as runtime or upper-layer concerns.",
    "Praxis records this as evidence while keeping omni analysis and TAP composition outside computeruse.microphoneStopRecording semantics.",
  ],
  createProvider: ({ provider, executor }) => provider ?? createRuntimeMicrophoneStopRecordingProvider(executor),
} satisfies MicrophoneStopRecordingProviderPractice;
