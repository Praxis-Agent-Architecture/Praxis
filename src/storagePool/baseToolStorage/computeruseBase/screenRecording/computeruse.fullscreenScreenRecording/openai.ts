import {
  createRuntimeFullscreenScreenRecordingProvider,
  type FullscreenScreenRecordingProviderPractice,
} from "./dependencies.js";

export const openaiFullscreenScreenRecordingPractice = {
  providerName: "openai",
  source: {
    kind: "cli",
    label: "Codex ComputerUse feature gate and media artifact handoff",
  },
  directCliSupport: true,
  sideEffectPolicy: "runtime-governed",
  notes: [
    "Codex treats computer-use and image/video material as runtime-gated capabilities, not as ungoverned local process work.",
    "Praxis keeps recording start as a session-handle primitive; TAP/agent may later route the final video artifact to omniBase.",
  ],
  createProvider: ({ provider, executor }) => provider ?? createRuntimeFullscreenScreenRecordingProvider(executor),
} satisfies FullscreenScreenRecordingProviderPractice;
