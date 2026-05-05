import { createRuntimeMouseClickProvider, type MouseClickProviderPractice } from "./dependencies.js";

export const anthropicMouseClickPractice = {
  providerName: "anthropic",
  source: {
    kind: "cli",
    label: "Claude Code computer-use permission and pointer action boundary practice",
  },
  directCliSupport: true,
  sideEffectPolicy: "runtime-governed",
  notes: [
    "Claude-style computer-use flows treat pointer events as permissioned runtime actions, not model-owned local automation.",
    "Praxis maps that lesson to BaseToolExecutorPort.computeruse.pointerAction with guard-gated real execution.",
  ],
  createProvider: ({ provider, executor }) => provider ?? createRuntimeMouseClickProvider(executor),
} satisfies MouseClickProviderPractice;
