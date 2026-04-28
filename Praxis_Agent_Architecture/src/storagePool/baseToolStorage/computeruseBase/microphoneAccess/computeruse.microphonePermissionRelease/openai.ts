import {
  createRuntimeMicrophonePermissionReleaseProvider,
  type MicrophonePermissionReleaseProviderPractice,
} from "./dependencies.js";

export const openaiMicrophonePermissionReleasePractice = {
  providerName: "openai",
  source: {
    kind: "cli",
    label: "Codex ComputerUse feature gate and governed media lease cleanup",
  },
  directCliSupport: true,
  sideEffectPolicy: "runtime-governed",
  notes: [
    "Codex-style computer-use capability is gated by product/runtime policy rather than hidden inside tool code.",
    "Praxis keeps microphone lease release behind the runtime executor port; TAP/agent owns when to call it.",
  ],
  createProvider: ({ provider, executor }) => provider ?? createRuntimeMicrophonePermissionReleaseProvider(executor),
} satisfies MicrophonePermissionReleaseProviderPractice;
