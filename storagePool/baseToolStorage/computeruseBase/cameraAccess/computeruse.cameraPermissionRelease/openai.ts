import {
  createRuntimeCameraPermissionReleaseProvider,
  type CameraPermissionReleaseProviderPractice,
} from "./dependencies.js";

export const openaiCameraPermissionReleasePractice = {
  providerName: "openai",
  source: {
    kind: "cli",
    label: "Codex ComputerUse feature gate and governed device lease lifecycle",
  },
  directCliSupport: true,
  sideEffectPolicy: "runtime-governed",
  notes: [
    "Codex-style computer-use capability is product/runtime gated rather than hidden inside tool code.",
    "Praxis keeps camera permission lease release behind the runtime executor port; TAP/agent decides workflow sequencing.",
  ],
  createProvider: ({ provider, executor }) => provider ?? createRuntimeCameraPermissionReleaseProvider(executor),
} satisfies CameraPermissionReleaseProviderPractice;
