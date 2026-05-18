import {
  createRuntimeCameraCapturePhotoProvider,
  type CameraCapturePhotoProviderPractice,
} from "./dependencies.js";

export const anthropicCameraCapturePhotoPractice = {
  providerName: "anthropic",
  source: {
    kind: "cli",
    label: "Claude Code computer-use permission, TCC, and media capture practice",
  },
  directCliSupport: true,
  sideEffectPolicy: "runtime-governed",
  notes: [
    "Claude-style computer-use flows treat camera access and app allowlists as runtime-owned permission state.",
    "Praxis maps photo capture to BaseToolExecutorPort.computeruse.captureCameraPhoto and keeps frame acquisition outside baseTool code.",
  ],
  createProvider: ({ provider, executor }) => provider ?? createRuntimeCameraCapturePhotoProvider(executor),
} satisfies CameraCapturePhotoProviderPractice;
