import {
  createRuntimeKeyboardInputEmulationProvider,
  type KeyboardInputEmulationProviderPractice,
} from "./dependencies.js";

export const openaiKeyboardInputEmulationPractice = {
  providerName: "openai",
  source: {
    kind: "cli",
    label: "Codex ComputerUse feature gate and runtime-owned action dispatch",
  },
  directCliSupport: true,
  sideEffectPolicy: "runtime-governed",
  notes: [
    "Codex-style computer-use actions are feature-gated runtime capabilities rather than hidden local automation inside a tool contract.",
    "Praxis maps text typing to BaseToolExecutorPort.computeruse.keyboardAction and keeps workflow strategy above baseTool.",
  ],
  createProvider: ({ provider, executor }) => provider ?? createRuntimeKeyboardInputEmulationProvider(executor),
} satisfies KeyboardInputEmulationProviderPractice;
