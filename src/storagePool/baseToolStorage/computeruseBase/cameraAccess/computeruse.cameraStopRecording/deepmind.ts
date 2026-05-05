import {
  createRuntimeCameraStopRecordingProvider,
  type CameraStopRecordingProviderPractice,
} from "./dependencies.js";

export const deepmindCameraStopRecordingPractice = {
  providerName: "deepmind",
  source: {
    kind: "cli",
    label: "Gemini visual-agent media session and evidence separation",
  },
  directCliSupport: true,
  sideEffectPolicy: "runtime-governed",
  notes: [
    "Gemini-style visual workflows keep media capture and artifact production in the runtime environment and pass governed references upward.",
    "Browser-agent evidence is practice context only; browser-use is not part of camera stop-recording semantics.",
  ],
  createProvider: ({ provider, executor }) => provider ?? createRuntimeCameraStopRecordingProvider(executor),
} satisfies CameraStopRecordingProviderPractice;
