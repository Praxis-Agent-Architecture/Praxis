import {
  createRuntimeCameraContentStorageProvider,
  type CameraContentStorageProviderPractice,
} from "./dependencies.js";

export const openaiCameraContentStoragePractice = {
  providerName: "openai",
  source: {
    kind: "cli",
    label: "Codex ComputerUse artifact material handoff and runtime feature gate",
  },
  directCliSupport: true,
  sideEffectPolicy: "runtime-governed",
  notes: [
    "Codex-style computer-use media material handling is runtime/product gated rather than hidden in baseTool code.",
    "Praxis stores only governed artifact references; TAP/agent decides whether camera material later routes to omni or other workflows.",
  ],
  createProvider: ({ provider, executor }) => provider ?? createRuntimeCameraContentStorageProvider(executor),
} satisfies CameraContentStorageProviderPractice;
