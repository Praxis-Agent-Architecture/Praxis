import { createRuntimeScreenshotStorageProvider, type ScreenshotStorageProviderPractice } from "./dependencies.js";

export const deepmindScreenshotStoragePractice = {
  providerName: "deepmind",
  source: {
    kind: "cli",
    label: "Gemini visual-agent screenshot evidence and runtime material handling",
    path: "~/Desktop/three/gemini_cli_0_39_1/integration-tests/browser-agent.screenshot.responses",
  },
  directCliSupport: true,
  sideEffectPolicy: "runtime-governed",
  notes: [
    "Gemini visual workflows provide screenshot evidence to the agent while the environment owns capture and material handling.",
    "Browser-agent evidence is recorded only as practice context here; browser-use is not this baseTool's semantics.",
  ],
  createProvider: ({ provider, executor }) => provider ?? createRuntimeScreenshotStorageProvider(executor),
} satisfies ScreenshotStorageProviderPractice;
