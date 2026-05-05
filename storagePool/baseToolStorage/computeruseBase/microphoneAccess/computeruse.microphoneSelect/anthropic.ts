import { createRuntimeMicrophoneSelectProvider, type MicrophoneSelectProviderPractice } from "./dependencies.js";

export const anthropicMicrophoneSelectPractice = {
  providerName: "anthropic",
  source: {
    kind: "cli",
    label: "Claude Code computer-use permission and app allowlist practice",
  },
  directCliSupport: true,
  sideEffectPolicy: "runtime-governed",
  notes: [
    "Claude-style computer-use flows keep device permission and app allowlist decisions in runtime.",
    "Praxis maps that lesson to BaseToolExecutorPort.computeruse.selectDevice and keeps microphone inventory outside the baseTool.",
  ],
  createProvider: ({ provider, executor }) => provider ?? createRuntimeMicrophoneSelectProvider(executor),
} satisfies MicrophoneSelectProviderPractice;
