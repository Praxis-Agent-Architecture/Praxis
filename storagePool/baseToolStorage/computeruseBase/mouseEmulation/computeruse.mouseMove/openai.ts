import { createRuntimeMouseMoveProvider, type MouseMoveProviderPractice } from "./dependencies.js";

export const openaiMouseMovePractice = {
  providerName: "openai",
  source: {
    kind: "cli",
    label: "Codex ComputerUse feature gate and pointer action handoff",
  },
  directCliSupport: true,
  sideEffectPolicy: "runtime-governed",
  notes: [
    "Codex computer-use actions are a gated runtime feature rather than hidden local pointer automation inside a tool definition.",
    "Praxis keeps movement semantics in storage while runtime owns pointer event delivery and focus policy.",
  ],
  createProvider: ({ provider, executor }) => provider ?? createRuntimeMouseMoveProvider(executor),
} satisfies MouseMoveProviderPractice;
