import { createRuntimeMouseScrollProvider, type MouseScrollProviderPractice } from "./dependencies.js";

export const anthropicMouseScrollPractice = {
  providerName: "anthropic",
  source: {
    kind: "cli",
    label: "Claude Code computer-use permission and pointer scroll boundary practice",
  },
  directCliSupport: true,
  sideEffectPolicy: "runtime-governed",
  notes: [
    "Claude-style computer-use flows treat wheel scrolling as a permissioned runtime action, not hidden OS automation.",
    "Praxis maps that lesson to BaseToolExecutorPort.computeruse.pointerAction with action: scroll and guard-gated real execution.",
  ],
  createProvider: ({ provider, executor }) => provider ?? createRuntimeMouseScrollProvider(executor),
} satisfies MouseScrollProviderPractice;
