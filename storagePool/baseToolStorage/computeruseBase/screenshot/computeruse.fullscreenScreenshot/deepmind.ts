import { createRuntimeFullscreenScreenshotProvider, type FullscreenScreenshotProviderPractice } from "./dependencies.js";

export const deepmindFullscreenScreenshotPractice = {
  providerName: "deepmind",
  source: {
    kind: "cli",
    label: "Gemini CLI Browser Agent screenshot and visual-agent evidence",
    path: "~/Desktop/three/gemini_cli_0_39_1/integration-tests/browser-agent.screenshot.responses",
  },
  directCliSupport: true,
  sideEffectPolicy: "runtime-governed",
  notes: [
    "Gemini CLI evidence shows screenshot capture as an agent/runtime tool result, sometimes followed by visual analysis.",
    "Praxis does not turn browser-use into computeruseBase semantics; this file records the screenshot/artifact practice only.",
  ],
  createProvider: ({ provider, executor }) => provider ?? createRuntimeFullscreenScreenshotProvider(executor),
} satisfies FullscreenScreenshotProviderPractice;
