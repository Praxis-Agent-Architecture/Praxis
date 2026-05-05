import { createHostExecutorShellSessionDetectionProvider } from "./dependencies.js";
import type { ShellSessionDetectionProviderPractice } from "./dependencies.js";

export const deepmindShellSessionDetectionPractice = {
  providerName: "deepmind",
  source: {
    kind: "cli",
    label: "Gemini CLI delegates shell session side effects to the CLI runtime",
    path: "/home/proview/Desktop/three/gemini-cli",
  },
  directCliSupport: true,
  sideEffectPolicy: "runtime-governed",
  notes: [
    "Praxis shapes and audits session hints; runtime owns process/session observation.",
    "Provider dispatch is only used after context.dryRun is false and runtime governance is affirmative.",
  ],
  createProvider: ({ provider, executor }) => provider ?? createHostExecutorShellSessionDetectionProvider(executor),
} satisfies ShellSessionDetectionProviderPractice;
