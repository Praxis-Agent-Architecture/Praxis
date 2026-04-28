import { createRuntimeMouseEmulationProvider, type MouseEmulationProviderPractice } from "./dependencies.js";

export const deepmindMouseEmulationPractice = {
  providerName: "deepmind",
  source: {
    kind: "cli",
    label: "Gemini visual-agent pointer sequence evidence",
  },
  directCliSupport: true,
  sideEffectPolicy: "runtime-governed",
  notes: [
    "Gemini visual-agent and browser-agent examples inform the evidence chain for sequenced pointer interactions.",
    "Browser-agent control remains TAP/MCP/runtime composition context; computeruse.mouseEmulation is only the primitive mouse sequence contract.",
  ],
  createProvider: ({ provider, executor }) => provider ?? createRuntimeMouseEmulationProvider(executor),
} satisfies MouseEmulationProviderPractice;
