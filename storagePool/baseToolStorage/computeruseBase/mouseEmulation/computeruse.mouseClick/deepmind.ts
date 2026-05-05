import { createRuntimeMouseClickProvider, type MouseClickProviderPractice } from "./dependencies.js";

export const deepmindMouseClickPractice = {
  providerName: "deepmind",
  source: {
    kind: "cli",
    label: "Gemini visual-agent pointer interaction evidence",
  },
  directCliSupport: true,
  sideEffectPolicy: "runtime-governed",
  notes: [
    "Gemini visual-agent and browser-agent examples inform the evidence chain for pointer interactions.",
    "Browser-agent control remains TAP/MCP/runtime composition context; computeruse.mouseClick is only the primitive pointer action contract.",
  ],
  createProvider: ({ provider, executor }) => provider ?? createRuntimeMouseClickProvider(executor),
} satisfies MouseClickProviderPractice;
