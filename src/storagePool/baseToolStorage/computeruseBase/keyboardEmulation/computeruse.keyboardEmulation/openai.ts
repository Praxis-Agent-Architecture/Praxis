import {
  createRuntimeKeyboardEmulationProvider,
  type KeyboardEmulationProviderPractice,
} from "./dependencies.js";

export const openaiKeyboardEmulationPractice = {
  providerName: "openai",
  source: {
    kind: "cli",
    label: "Codex ComputerUse feature gate and runtime-owned keyboard dispatch",
  },
  directCliSupport: true,
  sideEffectPolicy: "runtime-governed",
  notes: [
    "Codex-style computer-use actions are feature-gated runtime capabilities rather than hidden local automation inside a tool contract.",
    "Praxis maps generic keyboard sequences to BaseToolExecutorPort.computeruse.keyboardAction and keeps workflow strategy above baseTool.",
  ],
  createProvider: ({ provider, executor }) => provider ?? createRuntimeKeyboardEmulationProvider(executor),
} satisfies KeyboardEmulationProviderPractice;
