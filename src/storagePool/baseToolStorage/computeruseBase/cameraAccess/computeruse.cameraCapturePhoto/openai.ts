import {
  createRuntimeCameraCapturePhotoProvider,
  type CameraCapturePhotoProviderPractice,
} from "./dependencies.js";

export const openaiCameraCapturePhotoPractice = {
  providerName: "openai",
  source: {
    kind: "cli",
    label: "Codex ComputerUse feature gate and image material handoff",
  },
  directCliSupport: true,
  sideEffectPolicy: "runtime-governed",
  notes: [
    "Codex-style image material delivery is runtime/product gated rather than hidden inside individual tool code.",
    "Praxis returns a camera-photo artifact; TAP/agent decides whether that artifact should later route to omni.viewImage.",
  ],
  createProvider: ({ provider, executor }) => provider ?? createRuntimeCameraCapturePhotoProvider(executor),
} satisfies CameraCapturePhotoProviderPractice;
