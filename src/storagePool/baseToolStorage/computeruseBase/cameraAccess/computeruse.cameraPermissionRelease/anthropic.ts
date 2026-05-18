import {
  createRuntimeCameraPermissionReleaseProvider,
  type CameraPermissionReleaseProviderPractice,
} from "./dependencies.js";

export const anthropicCameraPermissionReleasePractice = {
  providerName: "anthropic",
  source: {
    kind: "cli",
    label: "Claude Code computer-use permission and app allowlist practice",
  },
  directCliSupport: true,
  sideEffectPolicy: "runtime-governed",
  notes: [
    "Claude-style computer-use flows treat device access grants as runtime-owned permission state.",
    "Praxis maps release to BaseToolExecutorPort.computeruse.releasePermission and keeps revocation policy in runtime/TAP.",
  ],
  createProvider: ({ provider, executor }) => provider ?? createRuntimeCameraPermissionReleaseProvider(executor),
} satisfies CameraPermissionReleaseProviderPractice;
