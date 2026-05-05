import { createRuntimeCursorLocateProvider, type CursorLocateProviderPractice } from "./dependencies.js";

export const openaiCursorLocatePractice = {
  providerName: "openai",
  source: {
    kind: "cli",
    label: "Codex ComputerUse cursor observation handoff",
  },
  directCliSupport: true,
  sideEffectPolicy: "runtime-governed",
  notes: [
    "Codex computer-use actions and observations are mediated by runtime feature gates rather than hidden desktop APIs inside the tool.",
    "Praxis keeps cursor-location semantics in storage while runtime owns pointer state reads and focus/privacy policy.",
  ],
  createProvider: ({ provider, executor }) => provider ?? createRuntimeCursorLocateProvider(executor),
} satisfies CursorLocateProviderPractice;
