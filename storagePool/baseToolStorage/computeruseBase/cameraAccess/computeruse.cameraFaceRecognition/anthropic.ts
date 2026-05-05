import {
  createRuntimeCameraFaceRecognitionProvider,
  type CameraFaceRecognitionProviderPractice,
} from "./dependencies.js";

export const anthropicCameraFaceRecognitionPractice = {
  providerName: "anthropic",
  source: {
    kind: "cli",
    label: "Claude Code computer-use privacy and vision-provider boundary practice",
  },
  directCliSupport: false,
  sideEffectPolicy: "runtime-governed",
  notes: [
    "Claude-style computer-use flows keep camera material, model-provider calls, and biometric consent policy outside individual tool code.",
    "Praxis maps camera face analysis to BaseToolExecutorPort.computeruse.analyzeCameraFrame and requires runtime/TAP approval for real execution.",
  ],
  createProvider: ({ provider, executor }) => provider ?? createRuntimeCameraFaceRecognitionProvider(executor),
} satisfies CameraFaceRecognitionProviderPractice;
