import { createRuntimeFullscreenScreenshotProvider, type FullscreenScreenshotProviderPractice } from "./dependencies.js";

export const anthropicFullscreenScreenshotPractice = {
  providerName: "anthropic",
  source: {
    kind: "cli",
    label: "Claude Code Computer Use permission approval",
    path: "~/Desktop/three/claude_code_2_1_88/components/permissions/ComputerUseApproval/ComputerUseApproval.tsx",
  },
  directCliSupport: true,
  sideEffectPolicy: "runtime-governed",
  notes: [
    "Claude Code treats computer use as a permission-gated runtime capability, including platform permissions such as Accessibility and Screen Recording.",
    "Praxis keeps that evidence as a runtime/TAP boundary: computeruseBase declares the screenshot capability and calls the runtime port.",
  ],
  createProvider: ({ provider, executor }) => provider ?? createRuntimeFullscreenScreenshotProvider(executor),
} satisfies FullscreenScreenshotProviderPractice;
