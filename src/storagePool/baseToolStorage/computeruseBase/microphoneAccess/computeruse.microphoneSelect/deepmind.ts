import { createRuntimeMicrophoneSelectProvider, type MicrophoneSelectProviderPractice } from "./dependencies.js";

export const deepmindMicrophoneSelectPractice = {
  providerName: "deepmind",
  source: {
    kind: "cli",
    label: "Gemini CLI media permission and visual-agent material handling practice",
  },
  directCliSupport: false,
  sideEffectPolicy: "runtime-governed",
  notes: [
    "Gemini-style media workflows treat device material and permission lifecycle as runtime-owned capabilities.",
    "Praxis records this as evidence while keeping browser-use and TAP composition outside computeruse.microphoneSelect semantics.",
  ],
  createProvider: ({ provider, executor }) => provider ?? createRuntimeMicrophoneSelectProvider(executor),
} satisfies MicrophoneSelectProviderPractice;
