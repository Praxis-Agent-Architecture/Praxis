import {
  createRuntimeMicrophonePermissionProvider,
  type MicrophonePermissionRequestProviderPractice,
} from "./dependencies.js";

export const deepmindMicrophonePermissionRequestPractice = {
  providerName: "deepmind",
  source: {
    kind: "cli",
    label: "Gemini media permission and visual-agent evidence separation",
  },
  directCliSupport: true,
  sideEffectPolicy: "runtime-governed",
  notes: [
    "Gemini-style media workflows keep device access in the runtime environment and pass only governed material references upward.",
    "Browser-agent evidence is practice context only; browser-use is not part of microphoneAccess semantics.",
  ],
  createProvider: ({ provider, executor }) => provider ?? createRuntimeMicrophonePermissionProvider(executor),
} satisfies MicrophonePermissionRequestProviderPractice;
