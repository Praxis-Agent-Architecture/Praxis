import { createRuntimeMouseMoveProvider, type MouseMoveProviderPractice } from "./dependencies.js";

export const anthropicMouseMovePractice = {
  providerName: "anthropic",
  source: {
    kind: "cli",
    label: "Claude Code computer-use permission and pointer movement boundary practice",
  },
  directCliSupport: true,
  sideEffectPolicy: "runtime-governed",
  notes: [
    "Claude-style computer-use flows treat pointer movement as permissioned runtime action, not hidden OS automation.",
    "Praxis maps that lesson to BaseToolExecutorPort.computeruse.pointerAction with guard-gated real execution.",
  ],
  createProvider: ({ provider, executor }) => provider ?? createRuntimeMouseMoveProvider(executor),
} satisfies MouseMoveProviderPractice;
