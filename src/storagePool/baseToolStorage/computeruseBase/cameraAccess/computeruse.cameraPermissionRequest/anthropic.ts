import {
  createRuntimeCameraPermissionProvider,
  type CameraPermissionRequestProviderPractice,
} from "./dependencies.js";

export const anthropicCameraPermissionRequestPractice = {
  providerName: "anthropic",
  source: {
    kind: "cli",
    label: "Claude Code computer-use permission and app allowlist practice",
  },
  directCliSupport: true,
  sideEffectPolicy: "runtime-governed",
  notes: [
    "Claude-style computer-use flows treat camera access as an explicit runtime permission boundary.",
    "Praxis maps that lesson to BaseToolExecutorPort.computeruse.requestPermission and keeps app allowlists in runtime/TAP.",
  ],
  createProvider: ({ provider, executor }) => provider ?? createRuntimeCameraPermissionProvider(executor),
} satisfies CameraPermissionRequestProviderPractice;
