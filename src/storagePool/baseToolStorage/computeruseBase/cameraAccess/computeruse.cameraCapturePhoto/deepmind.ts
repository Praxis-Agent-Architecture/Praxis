import {
  createRuntimeCameraCapturePhotoProvider,
  type CameraCapturePhotoProviderPractice,
} from "./dependencies.js";

export const deepmindCameraCapturePhotoPractice = {
  providerName: "deepmind",
  source: {
    kind: "cli",
    label: "Gemini media capture and visual-agent evidence separation",
  },
  directCliSupport: true,
  sideEffectPolicy: "runtime-governed",
  notes: [
    "Gemini-style visual workflows keep media acquisition in the runtime environment and pass governed material references upward.",
    "Browser-agent screenshot practice is evidence only; browser-use is not part of camera photo capture semantics.",
  ],
  createProvider: ({ provider, executor }) => provider ?? createRuntimeCameraCapturePhotoProvider(executor),
} satisfies CameraCapturePhotoProviderPractice;
