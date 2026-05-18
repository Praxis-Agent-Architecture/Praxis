import {
  createRuntimeRectangularSelectionScreenRecordingProvider,
  type RectangularSelectionScreenRecordingProviderPractice,
} from "./dependencies.js";

export const anthropicRectangularSelectionScreenRecordingPractice = {
  providerName: "anthropic",
  source: {
    kind: "cli",
    label: "Claude Code computer-use permission and app allowlist practice",
  },
  directCliSupport: true,
  sideEffectPolicy: "runtime-governed",
  notes: [
    "Claude-style computer-use flows keep screen access behind runtime permissions and allowlists.",
    "Praxis maps that lesson to runtime-owned region selection and recording sessions, not hidden local media tooling.",
  ],
  createProvider: ({ provider, executor }) => provider ?? createRuntimeRectangularSelectionScreenRecordingProvider(executor),
} satisfies RectangularSelectionScreenRecordingProviderPractice;
