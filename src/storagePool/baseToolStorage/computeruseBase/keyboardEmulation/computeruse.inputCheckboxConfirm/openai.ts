import {
  createRuntimeInputCheckboxConfirmProvider,
  type InputCheckboxConfirmProviderPractice,
} from "./dependencies.js";

export const openaiInputCheckboxConfirmPractice = {
  providerName: "openai",
  source: {
    kind: "cli",
    label: "Codex ComputerUse feature gate and runtime-owned confirm dispatch",
  },
  directCliSupport: true,
  sideEffectPolicy: "runtime-governed",
  notes: [
    "Codex-style computer-use actions are feature-gated runtime capabilities rather than hidden local automation inside a tool contract.",
    "Praxis maps checkbox confirmation to BaseToolExecutorPort.computeruse.keyboardAction and keeps workflow strategy above baseTool.",
  ],
  createProvider: ({ provider, executor }) => provider ?? createRuntimeInputCheckboxConfirmProvider(executor),
} satisfies InputCheckboxConfirmProviderPractice;
