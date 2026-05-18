import {
  createRuntimeCameraSelectProvider,
  type CameraSelectProviderPractice,
} from "./dependencies.js";

export const openaiCameraSelectPractice = {
  providerName: "openai",
  source: {
    kind: "cli",
    label: "Codex ComputerUse feature gate and governed device material handoff",
  },
  directCliSupport: true,
  sideEffectPolicy: "runtime-governed",
  notes: [
    "Codex-style computer-use capability is runtime gated rather than hidden inside tool implementation.",
    "Praxis keeps camera device selection as a runtime port; TAP/agent later decides whether captures route to omniBase.",
  ],
  createProvider: ({ provider, executor }) => provider ?? createRuntimeCameraSelectProvider(executor),
} satisfies CameraSelectProviderPractice;
