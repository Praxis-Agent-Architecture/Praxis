import {
  createRuntimeRectangularSelectionScreenRecordingProvider,
  type RectangularSelectionScreenRecordingProviderPractice,
} from "./dependencies.js";

export const deepmindRectangularSelectionScreenRecordingPractice = {
  providerName: "deepmind",
  source: {
    kind: "cli",
    label: "Gemini visual-agent screenshot and recording evidence practice",
  },
  directCliSupport: true,
  sideEffectPolicy: "runtime-governed",
  notes: [
    "Gemini visual-agent evidence reinforces that visual capture belongs to runtime/session infrastructure.",
    "Browser-agent examples are evidence only; browser-use is not this baseTool's semantics.",
  ],
  createProvider: ({ provider, executor }) => provider ?? createRuntimeRectangularSelectionScreenRecordingProvider(executor),
} satisfies RectangularSelectionScreenRecordingProviderPractice;
