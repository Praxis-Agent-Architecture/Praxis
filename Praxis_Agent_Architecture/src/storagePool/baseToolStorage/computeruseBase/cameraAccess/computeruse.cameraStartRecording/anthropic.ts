import {
  createRuntimeCameraStartRecordingProvider,
  type CameraStartRecordingProviderPractice,
} from "./dependencies.js";

export const anthropicCameraStartRecordingPractice = {
  providerName: "anthropic",
  source: {
    kind: "cli",
    label: "Claude Code computer-use permission, TCC, and media session practice",
  },
  directCliSupport: true,
  sideEffectPolicy: "runtime-governed",
  notes: [
    "Claude-style computer-use flows keep camera grants, app allowlists, and media sessions outside individual tool code.",
    "Praxis maps camera recording start to BaseToolExecutorPort.computeruse.startRecording and leaves stream ownership to runtime/TAP.",
  ],
  createProvider: ({ provider, executor }) => provider ?? createRuntimeCameraStartRecordingProvider(executor),
} satisfies CameraStartRecordingProviderPractice;
