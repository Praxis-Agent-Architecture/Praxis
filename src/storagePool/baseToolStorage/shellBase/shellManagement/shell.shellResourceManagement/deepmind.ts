import type { ShellResourceManagementProviderPractice } from "./dependencies.js";
import { createHostExecutorShellResourceManagementProvider } from "./dependencies.js";

export const deepmindShellResourceManagementPractice = {
  providerName: "deepmind",
  source: { kind: "cli", label: "Gemini CLI shell resource management boundary" },
  directCliSupport: true,
  sideEffectPolicy: "runtime-governed",
  notes: ["Runtime owns resource allocation and release.", "Praxis baseTools retain a provider-only side-effect boundary."],
  createProvider: ({ provider, executor }) => provider ?? createHostExecutorShellResourceManagementProvider(executor),
} as const satisfies ShellResourceManagementProviderPractice;
