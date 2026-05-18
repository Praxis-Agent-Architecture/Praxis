import {
  createRuntimeCameraStartRecordingProvider,
  type CameraStartRecordingProviderPractice,
} from "./dependencies.js";

export const openaiCameraStartRecordingPractice = {
  providerName: "openai",
  source: {
    kind: "cli",
    label: "Codex ComputerUse feature gate and media material handoff",
  },
  directCliSupport: true,
  sideEffectPolicy: "runtime-governed",
  notes: [
    "Codex-style computer-use and image/video material handling is runtime/product gated rather than hidden in baseTool code.",
    "Praxis returns a recording session handle; TAP/agent decides when to stop it and whether the resulting artifact routes to omni.viewVideo.",
  ],
  createProvider: ({ provider, executor }) => provider ?? createRuntimeCameraStartRecordingProvider(executor),
} satisfies CameraStartRecordingProviderPractice;
