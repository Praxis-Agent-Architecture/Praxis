import { createRuntimeMouseScrollProvider, type MouseScrollProviderPractice } from "./dependencies.js";

export const deepmindMouseScrollPractice = {
  providerName: "deepmind",
  source: {
    kind: "cli",
    label: "Gemini visual-agent pointer scroll evidence",
  },
  directCliSupport: true,
  sideEffectPolicy: "runtime-governed",
  notes: [
    "Gemini visual-agent and browser-agent examples inform the evidence chain for pointer interactions.",
    "Browser-agent control remains TAP/MCP/runtime composition context; computeruse.mouseScroll is only the primitive pointer scroll contract.",
  ],
  createProvider: ({ provider, executor }) => provider ?? createRuntimeMouseScrollProvider(executor),
} satisfies MouseScrollProviderPractice;
