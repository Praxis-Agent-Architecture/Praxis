import {
  createRuntimeInputCheckboxConfirmProvider,
  type InputCheckboxConfirmProviderPractice,
} from "./dependencies.js";

export const deepmindInputCheckboxConfirmPractice = {
  providerName: "deepmind",
  source: {
    kind: "cli",
    label: "Gemini visual-agent checkbox and keyboard action evidence",
  },
  directCliSupport: true,
  sideEffectPolicy: "runtime-governed",
  notes: [
    "Gemini browser/visual-agent practice is evidence for governed UI actions, not a reason to make browser-use part of this tool.",
    "Praxis keeps checkbox confirmation as a primitive keyboard action; TAP may combine it with observations or structured app control.",
  ],
  createProvider: ({ provider, executor }) => provider ?? createRuntimeInputCheckboxConfirmProvider(executor),
} satisfies InputCheckboxConfirmProviderPractice;
