import { createRuntimeKeyboardSubmitInputProvider, type KeyboardSubmitInputProviderPractice } from "./dependencies.js";

export const openaiKeyboardSubmitInputPractice = {
  providerName: "openai",
  source: {
    kind: "cli",
    label: "Codex ComputerUse feature gate and runtime-owned submit action dispatch",
  },
  directCliSupport: true,
  sideEffectPolicy: "runtime-governed",
  notes: [
    "Codex-style computer-use actions are feature-gated runtime capabilities rather than hidden local automation inside a tool contract.",
    "Praxis maps submit to BaseToolExecutorPort.computeruse.keyboardAction and keeps workflow strategy above baseTool.",
  ],
  createProvider: ({ provider, executor }) => provider ?? createRuntimeKeyboardSubmitInputProvider(executor),
} satisfies KeyboardSubmitInputProviderPractice;
