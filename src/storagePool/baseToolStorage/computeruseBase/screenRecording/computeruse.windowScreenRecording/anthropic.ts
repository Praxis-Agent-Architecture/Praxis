import {
  createRuntimeWindowScreenRecordingProvider,
  type WindowScreenRecordingProviderPractice,
} from "./dependencies.js";

export const anthropicWindowScreenRecordingPractice = {
  providerName: "anthropic",
  source: {
    kind: "cli",
    label: "Claude Code computer-use permission and app allowlist practice",
  },
  directCliSupport: true,
  sideEffectPolicy: "runtime-governed",
  notes: [
    "Claude-style computer-use flows keep app/window access behind runtime permissions and allowlists.",
    "Praxis maps that lesson to runtime-owned window selection and recording sessions, not hidden local media tooling.",
  ],
  createProvider: ({ provider, executor }) => provider ?? createRuntimeWindowScreenRecordingProvider(executor),
} satisfies WindowScreenRecordingProviderPractice;
