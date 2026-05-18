import {
  createRuntimeMicrophoneStopRecordingProvider,
  type MicrophoneStopRecordingProviderPractice,
} from "./dependencies.js";

export const anthropicMicrophoneStopRecordingPractice = {
  providerName: "anthropic",
  source: {
    kind: "cli",
    label: "Claude Code computer-use permission, TCC, recording cleanup, and app allowlist practice",
  },
  directCliSupport: true,
  sideEffectPolicy: "runtime-governed",
  notes: [
    "Claude-style computer-use flows keep recording stop, permission cleanup, and captured media ownership in runtime.",
    "Praxis maps that lesson to BaseToolExecutorPort.computeruse.stopRecording and keeps audio artifact lifecycle outside the baseTool.",
  ],
  createProvider: ({ provider, executor }) => provider ?? createRuntimeMicrophoneStopRecordingProvider(executor),
} satisfies MicrophoneStopRecordingProviderPractice;
