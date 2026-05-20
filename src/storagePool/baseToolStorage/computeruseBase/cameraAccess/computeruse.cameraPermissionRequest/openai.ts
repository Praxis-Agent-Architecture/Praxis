import {
  createRuntimeCameraPermissionProvider,
  type CameraPermissionRequestProviderPractice,
} from "./dependencies.js";

export const openaiCameraPermissionRequestPractice = {
  providerName: "openai",
  source: {
    kind: "cli",
    label: "Codex ComputerUse feature gate and governed media material handoff",
  },
  directCliSupport: true,
  sideEffectPolicy: "runtime-governed",
  notes: [
    "Codex-style computer-use capability is product/runtime gated rather than hidden inside tool code.",
    "Praxis keeps camera prompts and leases behind the runtime executor port; TAP/agent decides whether photo or video artifacts should later go to omniBase.",
  ],
  createProvider: ({ provider, executor }) => provider ?? createRuntimeCameraPermissionProvider(executor),
} satisfies CameraPermissionRequestProviderPractice;
