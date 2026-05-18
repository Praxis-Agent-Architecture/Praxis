import { createRuntimeMouseClickProvider, type MouseClickProviderPractice } from "./dependencies.js";

export const openaiMouseClickPractice = {
  providerName: "openai",
  source: {
    kind: "cli",
    label: "Codex ComputerUse feature gate and pointer action handoff",
  },
  directCliSupport: true,
  sideEffectPolicy: "runtime-governed",
  notes: [
    "Codex computer-use actions are a gated runtime feature rather than hidden OS automation inside a tool definition.",
    "Praxis keeps click semantics in storage while runtime owns the real pointer event and focus policy.",
  ],
  createProvider: ({ provider, executor }) => provider ?? createRuntimeMouseClickProvider(executor),
} satisfies MouseClickProviderPractice;
