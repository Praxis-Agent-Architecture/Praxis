import {
  createRuntimeScreenRecordingStorageProvider,
  type ScreenRecordingStorageProviderPractice,
} from "./dependencies.js";

export const openaiScreenRecordingStoragePractice = {
  providerName: "openai",
  source: {
    kind: "cli",
    label: "Codex ComputerUse feature gate and media artifact handoff",
  },
  directCliSupport: true,
  sideEffectPolicy: "runtime-governed",
  notes: [
    "Codex treats computer-use and media material as runtime-gated capabilities, not as ungoverned local process work.",
    "Praxis keeps recording storage as a session-handle finalization primitive; TAP/agent may later route the final video artifact to omniBase.",
  ],
  createProvider: ({ provider, executor }) => provider ?? createRuntimeScreenRecordingStorageProvider(executor),
} satisfies ScreenRecordingStorageProviderPractice;
