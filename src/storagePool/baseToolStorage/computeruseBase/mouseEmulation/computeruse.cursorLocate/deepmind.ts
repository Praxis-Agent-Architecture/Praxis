import { createRuntimeCursorLocateProvider, type CursorLocateProviderPractice } from "./dependencies.js";

export const deepmindCursorLocatePractice = {
  providerName: "deepmind",
  source: {
    kind: "cli",
    label: "Gemini visual-agent cursor observation evidence",
  },
  directCliSupport: true,
  sideEffectPolicy: "runtime-governed",
  notes: [
    "Gemini visual-agent and browser-agent examples inform the evidence chain for pointer observations.",
    "Browser-agent cursor state remains TAP/MCP/runtime composition context; computeruse.cursorLocate is only the primitive cursor observation contract.",
  ],
  createProvider: ({ provider, executor }) => provider ?? createRuntimeCursorLocateProvider(executor),
} satisfies CursorLocateProviderPractice;
