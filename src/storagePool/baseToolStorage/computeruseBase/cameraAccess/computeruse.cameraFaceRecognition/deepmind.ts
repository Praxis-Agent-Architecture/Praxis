import {
  createRuntimeCameraFaceRecognitionProvider,
  type CameraFaceRecognitionProviderPractice,
} from "./dependencies.js";

export const deepmindCameraFaceRecognitionPractice = {
  providerName: "deepmind",
  source: {
    kind: "cli",
    label: "Gemini visual-agent analysis with media and identity-policy separation",
  },
  directCliSupport: false,
  sideEffectPolicy: "runtime-governed",
  notes: [
    "Gemini-style visual workflows keep model/provider analysis and media material in runtime-owned surfaces.",
    "Praxis records this as practice evidence while keeping browser-use, omni routing, and biometric policy outside storage core.",
  ],
  createProvider: ({ provider, executor }) => provider ?? createRuntimeCameraFaceRecognitionProvider(executor),
} satisfies CameraFaceRecognitionProviderPractice;
