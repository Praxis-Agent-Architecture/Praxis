import {
  createRuntimeRectangularSelectionScreenRecordingProvider,
  type RectangularSelectionScreenRecordingProviderPractice,
} from "./dependencies.js";

export const openaiRectangularSelectionScreenRecordingPractice = {
  providerName: "openai",
  source: {
    kind: "cli",
    label: "Codex ComputerUse feature gate and media artifact handoff",
  },
  directCliSupport: true,
  sideEffectPolicy: "runtime-governed",
  notes: [
    "Codex treats computer-use and media material as runtime-gated capabilities, not as ungoverned local process work.",
    "Praxis keeps rectangular region recording start as a session-handle primitive; TAP/agent may later route the final artifact to omniBase.",
  ],
  createProvider: ({ provider, executor }) => provider ?? createRuntimeRectangularSelectionScreenRecordingProvider(executor),
} satisfies RectangularSelectionScreenRecordingProviderPractice;
