import {
  createRuntimeCameraSelectProvider,
  type CameraSelectProviderPractice,
} from "./dependencies.js";

export const deepmindCameraSelectPractice = {
  providerName: "deepmind",
  source: {
    kind: "cli",
    label: "Gemini media permission and browser-agent evidence separation",
  },
  directCliSupport: true,
  sideEffectPolicy: "runtime-governed",
  notes: [
    "Gemini media workflows keep browser-agent and device runtime evidence separate from low-level tool semantics.",
    "Browser-use is only practice context here; camera selection remains a primitive runtime-owned computer-use capability.",
  ],
  createProvider: ({ provider, executor }) => provider ?? createRuntimeCameraSelectProvider(executor),
} satisfies CameraSelectProviderPractice;
