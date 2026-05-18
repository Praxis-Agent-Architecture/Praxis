import { createRuntimeCursorLocateProvider, type CursorLocateProviderPractice } from "./dependencies.js";

export const anthropicCursorLocatePractice = {
  providerName: "anthropic",
  source: {
    kind: "cli",
    label: "Claude Code computer-use cursor observation boundary practice",
  },
  directCliSupport: true,
  sideEffectPolicy: "runtime-governed",
  notes: [
    "Claude-style computer-use flows treat cursor observation as runtime-owned host contact, not direct local OS reads in a tool definition.",
    "Praxis maps that lesson to BaseToolExecutorPort.computeruse.locateCursor with guard-gated live observation.",
  ],
  createProvider: ({ provider, executor }) => provider ?? createRuntimeCursorLocateProvider(executor),
} satisfies CursorLocateProviderPractice;
