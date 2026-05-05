import { createRuntimeMouseScrollProvider, type MouseScrollProviderPractice } from "./dependencies.js";

export const openaiMouseScrollPractice = {
  providerName: "openai",
  source: {
    kind: "cli",
    label: "Codex ComputerUse feature gate and pointer scroll handoff",
  },
  directCliSupport: true,
  sideEffectPolicy: "runtime-governed",
  notes: [
    "Codex computer-use actions are a gated runtime feature rather than hidden local wheel-event automation inside a tool definition.",
    "Praxis keeps scroll semantics in storage while runtime owns pointer event delivery and focus policy.",
  ],
  createProvider: ({ provider, executor }) => provider ?? createRuntimeMouseScrollProvider(executor),
} satisfies MouseScrollProviderPractice;
