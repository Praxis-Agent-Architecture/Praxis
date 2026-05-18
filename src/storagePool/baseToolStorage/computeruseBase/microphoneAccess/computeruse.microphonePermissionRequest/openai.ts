import {
  createRuntimeMicrophonePermissionProvider,
  type MicrophonePermissionRequestProviderPractice,
} from "./dependencies.js";

export const openaiMicrophonePermissionRequestPractice = {
  providerName: "openai",
  source: {
    kind: "cli",
    label: "Codex ComputerUse feature gate and governed media material handoff",
  },
  directCliSupport: true,
  sideEffectPolicy: "runtime-governed",
  notes: [
    "Codex-style computer-use capability is product/runtime gated rather than hidden inside tool code.",
    "Praxis keeps microphone prompts and leases behind the runtime executor port; TAP/agent decides whether audio should later go to omniBase.",
  ],
  createProvider: ({ provider, executor }) => provider ?? createRuntimeMicrophonePermissionProvider(executor),
} satisfies MicrophonePermissionRequestProviderPractice;
