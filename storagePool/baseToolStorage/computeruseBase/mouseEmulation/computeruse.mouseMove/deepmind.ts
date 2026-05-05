import { createRuntimeMouseMoveProvider, type MouseMoveProviderPractice } from "./dependencies.js";

export const deepmindMouseMovePractice = {
  providerName: "deepmind",
  source: {
    kind: "cli",
    label: "Gemini visual-agent pointer movement evidence",
  },
  directCliSupport: true,
  sideEffectPolicy: "runtime-governed",
  notes: [
    "Gemini visual-agent and browser-agent examples inform the evidence chain for pointer interactions.",
    "Browser-agent control remains TAP/MCP/runtime composition context; computeruse.mouseMove is only the primitive pointer movement contract.",
  ],
  createProvider: ({ provider, executor }) => provider ?? createRuntimeMouseMoveProvider(executor),
} satisfies MouseMoveProviderPractice;
