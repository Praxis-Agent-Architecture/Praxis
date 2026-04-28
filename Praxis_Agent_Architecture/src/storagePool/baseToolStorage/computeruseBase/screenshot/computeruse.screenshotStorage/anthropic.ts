import { createRuntimeScreenshotStorageProvider, type ScreenshotStorageProviderPractice } from "./dependencies.js";

export const anthropicScreenshotStoragePractice = {
  providerName: "anthropic",
  source: {
    kind: "cli",
    label: "Claude Code computer-use permission and artifact boundary practice",
    path: "~/Desktop/three/claude_code_2_1_88/components/permissions/ComputerUseApproval/ComputerUseApproval.tsx",
  },
  directCliSupport: true,
  sideEffectPolicy: "runtime-governed",
  notes: [
    "Claude-style computer-use flows treat screenshot material as permissioned runtime state rather than model-owned bytes.",
    "Praxis maps that lesson to a runtime-owned screenshot artifact store and keeps retention policy outside baseTool internals.",
  ],
  createProvider: ({ provider, executor }) => provider ?? createRuntimeScreenshotStorageProvider(executor),
} satisfies ScreenshotStorageProviderPractice;
