import {
  createRuntimeCameraFaceRecognitionProvider,
  type CameraFaceRecognitionProviderPractice,
} from "./dependencies.js";

export const openaiCameraFaceRecognitionPractice = {
  providerName: "openai",
  source: {
    kind: "cli",
    label: "Codex ComputerUse media analysis as runtime-gated material handoff",
  },
  directCliSupport: false,
  sideEffectPolicy: "runtime-governed",
  notes: [
    "Codex-style computer-use media analysis is runtime/product gated rather than hidden in baseTool code.",
    "Praxis exposes a governed frame-analysis primitive; TAP/agent decides whether camera content should be analyzed at all.",
  ],
  createProvider: ({ provider, executor }) => provider ?? createRuntimeCameraFaceRecognitionProvider(executor),
} satisfies CameraFaceRecognitionProviderPractice;
