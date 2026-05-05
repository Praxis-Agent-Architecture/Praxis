import {
  createRuntimeCameraStopRecordingProvider,
  type CameraStopRecordingProviderPractice,
} from "./dependencies.js";

export const anthropicCameraStopRecordingPractice = {
  providerName: "anthropic",
  source: {
    kind: "cli",
    label: "Claude Code computer-use permission, TCC, and media session practice",
  },
  directCliSupport: true,
  sideEffectPolicy: "runtime-governed",
  notes: [
    "Claude-style computer-use flows keep device grants, media sessions, and final video artifacts outside individual tool code.",
    "Praxis maps camera recording stop/finalization to BaseToolExecutorPort.computeruse.stopRecording and leaves cleanup to runtime/TAP.",
  ],
  createProvider: ({ provider, executor }) => provider ?? createRuntimeCameraStopRecordingProvider(executor),
} satisfies CameraStopRecordingProviderPractice;
