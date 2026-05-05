import { createRuntimeScreenshotStorageProvider, type ScreenshotStorageProviderPractice } from "./dependencies.js";

export const openaiScreenshotStoragePractice = {
  providerName: "openai",
  source: {
    kind: "cli",
    label: "Codex ComputerUse feature gate and image artifact handoff",
    path: "~/Desktop/three/codex_rust_0_125_0/codex-rs/features/src/lib.rs",
  },
  directCliSupport: true,
  sideEffectPolicy: "runtime-governed",
  notes: [
    "Codex image material handoff is treated as a governed runtime artifact rather than a hidden filesystem write.",
    "Praxis keeps screenshot storage as an artifact reference operation; TAP/agent may later route that artifact to omniBase.",
  ],
  createProvider: ({ provider, executor }) => provider ?? createRuntimeScreenshotStorageProvider(executor),
} satisfies ScreenshotStorageProviderPractice;
