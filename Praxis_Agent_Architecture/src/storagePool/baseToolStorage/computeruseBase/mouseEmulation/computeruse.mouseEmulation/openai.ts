import { createRuntimeMouseEmulationProvider, type MouseEmulationProviderPractice } from "./dependencies.js";

export const openaiMouseEmulationPractice = {
  providerName: "openai",
  source: {
    kind: "cli",
    label: "Codex ComputerUse feature gate and pointer action handoff",
  },
  directCliSupport: true,
  sideEffectPolicy: "runtime-governed",
  notes: [
    "Codex computer-use actions are gated runtime capabilities, not hidden OS automation inside a tool definition.",
    "Praxis maps a mouse sequence to runtime-owned locateCursor and pointerAction calls without choosing browser/MCP fallbacks.",
  ],
  createProvider: ({ provider, executor }) => provider ?? createRuntimeMouseEmulationProvider(executor),
} satisfies MouseEmulationProviderPractice;
