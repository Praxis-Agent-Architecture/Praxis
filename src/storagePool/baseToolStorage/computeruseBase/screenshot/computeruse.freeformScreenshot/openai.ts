import { createRuntimeFreeformScreenshotProvider, type FreeformScreenshotProviderPractice } from "./dependencies.js";

export const openaiFreeformScreenshotPractice = {
  providerName: "openai",
  source: {
    kind: "cli",
    label: "Codex ComputerUse feature gate and image material handoff",
    path: "~/Desktop/three/codex_rust_0_125_0/codex-rs/features/src/lib.rs",
  },
  directCliSupport: true,
  sideEffectPolicy: "runtime-governed",
  notes: [
    "Codex exposes ComputerUse as a gated product/runtime feature, not as hidden local work inside a base tool.",
    "Codex image handoff examples support returning artifacts/material references that upper layers may later route to image understanding.",
  ],
  createProvider: ({ provider, executor }) => provider ?? createRuntimeFreeformScreenshotProvider(executor),
} satisfies FreeformScreenshotProviderPractice;
