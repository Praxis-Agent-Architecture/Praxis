import {
  createRuntimeKeyboardInputEmulationProvider,
  type KeyboardInputEmulationProviderPractice,
} from "./dependencies.js";

export const deepmindKeyboardInputEmulationPractice = {
  providerName: "deepmind",
  source: {
    kind: "cli",
    label: "Gemini visual-agent keyboard action evidence",
  },
  directCliSupport: true,
  sideEffectPolicy: "runtime-governed",
  notes: [
    "Gemini browser/visual-agent practice is evidence for governed UI actions, not a reason to make browser-use part of this tool.",
    "Praxis keeps keyboard input as a primitive runtime action; TAP may combine it with observations or structured app control.",
  ],
  createProvider: ({ provider, executor }) => provider ?? createRuntimeKeyboardInputEmulationProvider(executor),
} satisfies KeyboardInputEmulationProviderPractice;
