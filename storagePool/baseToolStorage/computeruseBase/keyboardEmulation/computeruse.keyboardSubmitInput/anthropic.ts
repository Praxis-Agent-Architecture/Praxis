import { createRuntimeKeyboardSubmitInputProvider, type KeyboardSubmitInputProviderPractice } from "./dependencies.js";

export const anthropicKeyboardSubmitInputPractice = {
  providerName: "anthropic",
  source: {
    kind: "cli",
    label: "Claude Code computer-use keyboard submit permission practice",
  },
  directCliSupport: true,
  sideEffectPolicy: "runtime-governed",
  notes: [
    "Claude-style computer use treats submit/enter actions as permissioned runtime UI events.",
    "Praxis keeps focus, OS automation backends, and permission prompts in runtime/TAP.",
  ],
  createProvider: ({ provider, executor }) => provider ?? createRuntimeKeyboardSubmitInputProvider(executor),
} satisfies KeyboardSubmitInputProviderPractice;
