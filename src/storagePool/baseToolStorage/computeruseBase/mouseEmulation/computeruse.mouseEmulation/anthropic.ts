import { createRuntimeMouseEmulationProvider, type MouseEmulationProviderPractice } from "./dependencies.js";

export const anthropicMouseEmulationPractice = {
  providerName: "anthropic",
  source: {
    kind: "cli",
    label: "Claude Code computer-use permission and pointer sequence boundary practice",
  },
  directCliSupport: true,
  sideEffectPolicy: "runtime-governed",
  notes: [
    "Claude-style computer-use flows treat cursor observation and pointer actions as permissioned runtime actions.",
    "Praxis keeps the mouse sequence contract in storage while runtime owns the live cursor read and pointer events.",
  ],
  createProvider: ({ provider, executor }) => provider ?? createRuntimeMouseEmulationProvider(executor),
} satisfies MouseEmulationProviderPractice;
