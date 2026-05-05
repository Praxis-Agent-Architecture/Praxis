import { createRuntimeCheckboxConfirmProvider, type CheckboxConfirmProviderPractice } from "./dependencies.js";

export const anthropicCheckboxConfirmPractice = {
  providerName: "anthropic",
  source: {
    kind: "cli",
    label: "Claude Code computer-use checkbox confirmation boundary practice",
  },
  directCliSupport: true,
  sideEffectPolicy: "runtime-governed",
  notes: [
    "Claude-style computer-use flows treat checkbox confirmation as a permissioned runtime pointer action, not hidden local UI automation.",
    "Praxis maps that lesson to BaseToolExecutorPort.computeruse.pointerAction with action: confirm and guard-gated real execution.",
  ],
  createProvider: ({ provider, executor }) => provider ?? createRuntimeCheckboxConfirmProvider(executor),
} satisfies CheckboxConfirmProviderPractice;
