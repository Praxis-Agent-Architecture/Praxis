import { createRuntimeCheckboxConfirmProvider, type CheckboxConfirmProviderPractice } from "./dependencies.js";

export const openaiCheckboxConfirmPractice = {
  providerName: "openai",
  source: {
    kind: "cli",
    label: "Codex ComputerUse checkbox confirmation handoff",
  },
  directCliSupport: true,
  sideEffectPolicy: "runtime-governed",
  notes: [
    "Codex computer-use actions are mediated by runtime feature gates rather than hidden checkbox automation inside a baseTool.",
    "Praxis keeps checkbox confirmation semantics in storage while runtime owns pointer event delivery and focus policy.",
  ],
  createProvider: ({ provider, executor }) => provider ?? createRuntimeCheckboxConfirmProvider(executor),
} satisfies CheckboxConfirmProviderPractice;
