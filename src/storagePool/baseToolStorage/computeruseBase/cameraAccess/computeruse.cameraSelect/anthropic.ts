import {
  createRuntimeCameraSelectProvider,
  type CameraSelectProviderPractice,
} from "./dependencies.js";

export const anthropicCameraSelectPractice = {
  providerName: "anthropic",
  source: {
    kind: "cli",
    label: "Claude Code computer-use permission, TCC, and app allowlist practice",
  },
  directCliSupport: true,
  sideEffectPolicy: "runtime-governed",
  notes: [
    "Claude-style computer-use flows keep device and application allowlists outside individual tool code.",
    "Praxis maps camera selection to BaseToolExecutorPort.computeruse.selectDevice and leaves OS device policy to runtime/TAP.",
  ],
  createProvider: ({ provider, executor }) => provider ?? createRuntimeCameraSelectProvider(executor),
} satisfies CameraSelectProviderPractice;
