import {
  createRuntimeCameraStopRecordingProvider,
  type CameraStopRecordingProviderPractice,
} from "./dependencies.js";

export const openaiCameraStopRecordingPractice = {
  providerName: "openai",
  source: {
    kind: "cli",
    label: "Codex ComputerUse media material handoff and runtime feature gate",
  },
  directCliSupport: true,
  sideEffectPolicy: "runtime-governed",
  notes: [
    "Codex-style computer-use material capture is runtime/product gated rather than hidden in baseTool code.",
    "Praxis returns a governed video artifact reference; TAP/agent decides whether to route it to omni, storage, or a higher workflow.",
  ],
  createProvider: ({ provider, executor }) => provider ?? createRuntimeCameraStopRecordingProvider(executor),
} satisfies CameraStopRecordingProviderPractice;
