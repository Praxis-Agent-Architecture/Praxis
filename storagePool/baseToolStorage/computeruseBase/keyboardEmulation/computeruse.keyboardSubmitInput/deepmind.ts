import { createRuntimeKeyboardSubmitInputProvider, type KeyboardSubmitInputProviderPractice } from "./dependencies.js";

export const deepmindKeyboardSubmitInputPractice = {
  providerName: "deepmind",
  source: {
    kind: "cli",
    label: "Gemini visual-agent submit action evidence",
  },
  directCliSupport: true,
  sideEffectPolicy: "runtime-governed",
  notes: [
    "Gemini browser/visual-agent practice is evidence for governed UI actions, not a reason to make browser-use part of this tool.",
    "Praxis keeps submit as a primitive runtime keyboard action; TAP may combine it with observations or structured app control.",
  ],
  createProvider: ({ provider, executor }) => provider ?? createRuntimeKeyboardSubmitInputProvider(executor),
} satisfies KeyboardSubmitInputProviderPractice;
