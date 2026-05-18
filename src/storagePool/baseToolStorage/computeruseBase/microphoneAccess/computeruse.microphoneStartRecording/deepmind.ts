import {
  createRuntimeMicrophoneStartRecordingProvider,
  type MicrophoneStartRecordingProviderPractice,
} from "./dependencies.js";

export const deepmindMicrophoneStartRecordingPractice = {
  providerName: "deepmind",
  source: {
    kind: "cli",
    label: "Gemini CLI media permission and recording material handling practice",
  },
  directCliSupport: false,
  sideEffectPolicy: "runtime-governed",
  notes: [
    "Gemini-style media workflows treat captured audio material, recording handles, and provider analysis as runtime or upper-layer concerns.",
    "Praxis records this as evidence while keeping omni analysis and TAP composition outside computeruse.microphoneStartRecording semantics.",
  ],
  createProvider: ({ provider, executor }) => provider ?? createRuntimeMicrophoneStartRecordingProvider(executor),
} satisfies MicrophoneStartRecordingProviderPractice;
