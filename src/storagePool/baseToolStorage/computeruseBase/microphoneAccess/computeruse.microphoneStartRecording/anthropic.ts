import {
  createRuntimeMicrophoneStartRecordingProvider,
  type MicrophoneStartRecordingProviderPractice,
} from "./dependencies.js";

export const anthropicMicrophoneStartRecordingPractice = {
  providerName: "anthropic",
  source: {
    kind: "cli",
    label: "Claude Code computer-use permission, TCC, and app allowlist practice",
  },
  directCliSupport: true,
  sideEffectPolicy: "runtime-governed",
  notes: [
    "Claude-style computer-use flows keep microphone prompts, app allowlists, and device streams in runtime.",
    "Praxis maps that lesson to BaseToolExecutorPort.computeruse.startRecording and keeps recording session ownership outside the baseTool.",
  ],
  createProvider: ({ provider, executor }) => provider ?? createRuntimeMicrophoneStartRecordingProvider(executor),
} satisfies MicrophoneStartRecordingProviderPractice;
