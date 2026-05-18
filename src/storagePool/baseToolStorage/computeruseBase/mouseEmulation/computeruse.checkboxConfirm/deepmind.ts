import { createRuntimeCheckboxConfirmProvider, type CheckboxConfirmProviderPractice } from "./dependencies.js";

export const deepmindCheckboxConfirmPractice = {
  providerName: "deepmind",
  source: {
    kind: "cli",
    label: "Gemini visual-agent checkbox confirmation evidence",
  },
  directCliSupport: true,
  sideEffectPolicy: "runtime-governed",
  notes: [
    "Gemini visual-agent and browser-agent examples inform the evidence chain for confirming UI state through pointer actions.",
    "Browser-agent control remains TAP/MCP/runtime composition context; computeruse.checkboxConfirm is only the primitive checkbox confirmation contract.",
  ],
  createProvider: ({ provider, executor }) => provider ?? createRuntimeCheckboxConfirmProvider(executor),
} satisfies CheckboxConfirmProviderPractice;
