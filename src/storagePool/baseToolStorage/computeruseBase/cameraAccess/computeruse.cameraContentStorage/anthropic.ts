import {
  createRuntimeCameraContentStorageProvider,
  type CameraContentStorageProviderPractice,
} from "./dependencies.js";

export const anthropicCameraContentStoragePractice = {
  providerName: "anthropic",
  source: {
    kind: "cli",
    label: "Claude Code artifact and media-material handoff practice",
  },
  directCliSupport: true,
  sideEffectPolicy: "runtime-governed",
  notes: [
    "Claude-style computer-use flows keep camera bytes, privacy boundaries, and artifact retention outside individual tool code.",
    "Praxis maps camera content storage to BaseToolExecutorPort.artifact.store and leaves material ownership to runtime/TAP.",
  ],
  createProvider: ({ provider, executor }) => provider ?? createRuntimeCameraContentStorageProvider(executor),
} satisfies CameraContentStorageProviderPractice;
