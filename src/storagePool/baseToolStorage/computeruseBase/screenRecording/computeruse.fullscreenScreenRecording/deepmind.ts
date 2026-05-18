import {
  createRuntimeFullscreenScreenRecordingProvider,
  type FullscreenScreenRecordingProviderPractice,
} from "./dependencies.js";

export const deepmindFullscreenScreenRecordingPractice = {
  providerName: "deepmind",
  source: {
    kind: "cli",
    label: "Gemini visual-agent screenshot and recording evidence practice",
  },
  directCliSupport: true,
  sideEffectPolicy: "runtime-governed",
  notes: [
    "Gemini visual-agent evidence reinforces the boundary that environment capture is owned by runtime/session infrastructure.",
    "Browser-agent examples are evidence only; browser-use is not this baseTool's semantics.",
  ],
  createProvider: ({ provider, executor }) => provider ?? createRuntimeFullscreenScreenRecordingProvider(executor),
} satisfies FullscreenScreenRecordingProviderPractice;
