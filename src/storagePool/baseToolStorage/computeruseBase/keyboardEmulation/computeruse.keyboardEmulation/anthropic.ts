import {
  createRuntimeKeyboardEmulationProvider,
  type KeyboardEmulationProviderPractice,
} from "./dependencies.js";

export const anthropicKeyboardEmulationPractice = {
  providerName: "anthropic",
  source: {
    kind: "cli",
    label: "Claude Code computer-use keyboard permission and focused-action practice",
  },
  directCliSupport: true,
  sideEffectPolicy: "runtime-governed",
  notes: [
    "Claude-style computer use treats keyboard actions as permissioned runtime events, not model-owned host control.",
    "Praxis keeps focus selection, OS automation backends, app allowlists, and permission prompts in runtime/TAP.",
  ],
  createProvider: ({ provider, executor }) => provider ?? createRuntimeKeyboardEmulationProvider(executor),
} satisfies KeyboardEmulationProviderPractice;
