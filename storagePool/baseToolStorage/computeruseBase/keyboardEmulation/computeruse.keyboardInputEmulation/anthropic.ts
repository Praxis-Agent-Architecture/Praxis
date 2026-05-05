import {
  createRuntimeKeyboardInputEmulationProvider,
  type KeyboardInputEmulationProviderPractice,
} from "./dependencies.js";

export const anthropicKeyboardInputEmulationPractice = {
  providerName: "anthropic",
  source: {
    kind: "cli",
    label: "Claude Code computer-use keyboard permission and focused-input practice",
  },
  directCliSupport: true,
  sideEffectPolicy: "runtime-governed",
  notes: [
    "Claude-style computer use treats keyboard input as a permissioned runtime event, not as model-owned host control.",
    "Praxis keeps target focus, OS automation backends, and permission prompts in runtime/TAP.",
  ],
  createProvider: ({ provider, executor }) => provider ?? createRuntimeKeyboardInputEmulationProvider(executor),
} satisfies KeyboardInputEmulationProviderPractice;
