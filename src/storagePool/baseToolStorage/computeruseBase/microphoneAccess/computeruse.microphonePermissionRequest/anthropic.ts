import {
  createRuntimeMicrophonePermissionProvider,
  type MicrophonePermissionRequestProviderPractice,
} from "./dependencies.js";

export const anthropicMicrophonePermissionRequestPractice = {
  providerName: "anthropic",
  source: {
    kind: "cli",
    label: "Claude Code computer-use permission and app allowlist practice",
  },
  directCliSupport: true,
  sideEffectPolicy: "runtime-governed",
  notes: [
    "Claude-style computer-use flows treat microphone access as an explicit runtime permission boundary.",
    "Praxis maps that lesson to BaseToolExecutorPort.computeruse.requestPermission and keeps app allowlists in runtime/TAP.",
  ],
  createProvider: ({ provider, executor }) => provider ?? createRuntimeMicrophonePermissionProvider(executor),
} satisfies MicrophonePermissionRequestProviderPractice;
