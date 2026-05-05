import {
  createRuntimeMicrophonePermissionReleaseProvider,
  type MicrophonePermissionReleaseProviderPractice,
} from "./dependencies.js";

export const anthropicMicrophonePermissionReleasePractice = {
  providerName: "anthropic",
  source: {
    kind: "cli",
    label: "Claude Code computer-use permission revocation and app allowlist practice",
  },
  directCliSupport: true,
  sideEffectPolicy: "runtime-governed",
  notes: [
    "Claude-style computer-use flows treat device permission release as runtime-owned lifecycle cleanup.",
    "Praxis maps that lesson to BaseToolExecutorPort.computeruse.releasePermission and keeps lease ownership in runtime/TAP.",
  ],
  createProvider: ({ provider, executor }) => provider ?? createRuntimeMicrophonePermissionReleaseProvider(executor),
} satisfies MicrophonePermissionReleaseProviderPractice;
