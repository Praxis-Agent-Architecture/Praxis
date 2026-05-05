import {
  createRuntimeInputCheckboxConfirmProvider,
  type InputCheckboxConfirmProviderPractice,
} from "./dependencies.js";

export const anthropicInputCheckboxConfirmPractice = {
  providerName: "anthropic",
  source: {
    kind: "cli",
    label: "Claude Code computer-use checkbox confirmation and app allowlist practice",
  },
  directCliSupport: true,
  sideEffectPolicy: "runtime-governed",
  notes: [
    "Claude-style computer use treats checkbox confirmation as permissioned focused input, not model-owned host control.",
    "Praxis keeps focus selection, OS automation backends, app allowlists, and permission prompts in runtime/TAP.",
  ],
  createProvider: ({ provider, executor }) => provider ?? createRuntimeInputCheckboxConfirmProvider(executor),
} satisfies InputCheckboxConfirmProviderPractice;
