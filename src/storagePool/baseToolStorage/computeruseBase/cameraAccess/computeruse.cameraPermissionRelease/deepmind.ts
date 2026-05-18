import {
  createRuntimeCameraPermissionReleaseProvider,
  type CameraPermissionReleaseProviderPractice,
} from "./dependencies.js";

export const deepmindCameraPermissionReleasePractice = {
  providerName: "deepmind",
  source: {
    kind: "cli",
    label: "Gemini media permission and visual-agent evidence separation",
  },
  directCliSupport: true,
  sideEffectPolicy: "runtime-governed",
  notes: [
    "Gemini-style media workflows keep device access in the runtime environment and pass only governed material references upward.",
    "Browser-agent evidence is practice context only; browser-use is not part of cameraAccess semantics.",
  ],
  createProvider: ({ provider, executor }) => provider ?? createRuntimeCameraPermissionReleaseProvider(executor),
} satisfies CameraPermissionReleaseProviderPractice;
