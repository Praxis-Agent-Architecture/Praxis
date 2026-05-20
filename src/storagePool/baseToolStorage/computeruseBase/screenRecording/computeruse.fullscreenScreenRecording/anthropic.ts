import {
  createRuntimeFullscreenScreenRecordingProvider,
  type FullscreenScreenRecordingProviderPractice,
} from "./dependencies.js";

export const anthropicFullscreenScreenRecordingPractice = {
  providerName: "anthropic",
  source: {
    kind: "cli",
    label: "Claude Code computer-use permission and screen-recording boundary practice",
  },
  directCliSupport: true,
  sideEffectPolicy: "runtime-governed",
  notes: [
    "Claude-style computer-use flows keep screen access behind runtime permissions and app allowlists.",
    "Praxis maps that lesson to a runtime-owned recording session handle rather than hidden media tooling inside baseTool code.",
  ],
  createProvider: ({ provider, executor }) => provider ?? createRuntimeFullscreenScreenRecordingProvider(executor),
} satisfies FullscreenScreenRecordingProviderPractice;
