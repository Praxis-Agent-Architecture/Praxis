import {
  createRuntimeCameraContentStorageProvider,
  type CameraContentStorageProviderPractice,
} from "./dependencies.js";

export const deepmindCameraContentStoragePractice = {
  providerName: "deepmind",
  source: {
    kind: "cli",
    label: "Gemini visual-agent evidence and artifact separation",
  },
  directCliSupport: true,
  sideEffectPolicy: "runtime-governed",
  notes: [
    "Gemini-style visual workflows keep media artifacts in runtime-owned storage and pass governed references upward.",
    "Vision or face analysis is a separate model/runtime concern; cameraContentStorage only stores an existing camera artifact reference.",
  ],
  createProvider: ({ provider, executor }) => provider ?? createRuntimeCameraContentStorageProvider(executor),
} satisfies CameraContentStorageProviderPractice;
