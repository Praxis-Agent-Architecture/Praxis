import type { ShellPermissionControlProviderPractice } from "./dependencies.js";
import { createHostExecutorShellPermissionControlProvider } from "./dependencies.js";

export const deepmindShellPermissionControlPractice = {
  providerName: "deepmind",
  source: {
    kind: "cli",
    label: "Gemini CLI command confirmation and permission practice",
  },
  directCliSupport: true,
  sideEffectPolicy: "runtime-governed",
  notes: ["Provider practice metadata is audit context; permission evaluation stays Praxis-native."],
  createProvider: ({ provider, executor }) =>
    provider ?? createHostExecutorShellPermissionControlProvider(executor),
} as const satisfies ShellPermissionControlProviderPractice;
