import {
  createRuntimeMicrophonePermissionReleaseProvider,
  type MicrophonePermissionReleaseProviderPractice,
} from "./dependencies.js";

export const deepmindMicrophonePermissionReleasePractice = {
  providerName: "deepmind",
  source: {
    kind: "cli",
    label: "Gemini media permission lifecycle and runtime material handling",
  },
  directCliSupport: true,
  sideEffectPolicy: "runtime-governed",
  notes: [
    "Gemini-style media workflows keep device permission lifecycle in the runtime environment.",
    "Browser-agent evidence is practice context only; browser-use is not part of microphoneAccess semantics.",
  ],
  createProvider: ({ provider, executor }) => provider ?? createRuntimeMicrophonePermissionReleaseProvider(executor),
} satisfies MicrophonePermissionReleaseProviderPractice;
