import type { ShellProcessManagementProviderPractice } from "./dependencies.js";
import { createHostExecutorShellProcessManagementProvider } from "./dependencies.js";

export const deepmindShellProcessManagementPractice = {
  providerName: "deepmind",
  source: { kind: "cli", label: "Gemini CLI process management boundary" },
  directCliSupport: true,
  sideEffectPolicy: "runtime-governed",
  notes: ["Runtime mediates process inspection and mutation.", "Praxis baseTools preserve the same provider-owned side-effect boundary."],
  createProvider: ({ provider, executor }) => provider ?? createHostExecutorShellProcessManagementProvider(executor),
} as const satisfies ShellProcessManagementProviderPractice;
