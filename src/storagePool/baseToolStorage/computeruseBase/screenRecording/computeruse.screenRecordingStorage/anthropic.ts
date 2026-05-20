import {
  createRuntimeScreenRecordingStorageProvider,
  type ScreenRecordingStorageProviderPractice,
} from "./dependencies.js";

export const anthropicScreenRecordingStoragePractice = {
  providerName: "anthropic",
  source: {
    kind: "cli",
    label: "Claude Code computer-use permission and app allowlist practice",
  },
  directCliSupport: true,
  sideEffectPolicy: "runtime-governed",
  notes: [
    "Claude-style computer-use flows keep screen and app access behind runtime permissions and allowlists.",
    "Praxis maps that lesson to runtime-owned recording session finalization and artifact storage, not hidden local media tooling.",
  ],
  createProvider: ({ provider, executor }) => provider ?? createRuntimeScreenRecordingStorageProvider(executor),
} satisfies ScreenRecordingStorageProviderPractice;
