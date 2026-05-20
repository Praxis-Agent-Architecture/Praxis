import {
  createRuntimeCameraStartRecordingProvider,
  type CameraStartRecordingProviderPractice,
} from "./dependencies.js";

export const deepmindCameraStartRecordingPractice = {
  providerName: "deepmind",
  source: {
    kind: "cli",
    label: "Gemini media recording and visual-agent evidence separation",
  },
  directCliSupport: true,
  sideEffectPolicy: "runtime-governed",
  notes: [
    "Gemini-style visual workflows keep media capture sessions in the runtime environment and pass governed references upward.",
    "Browser-agent evidence is practice context only; browser-use is not part of camera recording semantics.",
  ],
  createProvider: ({ provider, executor }) => provider ?? createRuntimeCameraStartRecordingProvider(executor),
} satisfies CameraStartRecordingProviderPractice;
