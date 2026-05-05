import type { ShellExecutionMonitoringProviderPractice } from "./dependencies.js";
import { createHostExecutorShellExecutionMonitoringProvider } from "./dependencies.js";

export const deepmindShellExecutionMonitoringPractice = {
  providerName: "deepmind",
  source: { kind: "cli", label: "Gemini CLI shell interaction practice delegates process/session side effects to the CLI runtime", path: "/home/proview/Desktop/three/gemini-cli" },
  directCliSupport: true,
  sideEffectPolicy: "runtime-governed",
  notes: [
    "Praxis baseTools shape and audit the request; runtime owns session/process policy and side effects.",
    "Provider dispatch is only used after context.dryRun is false and runtime governance is affirmative.",
    "This adapter is host-executor based; it does not claim an SDK-owned process observer or hidden shell fallback.",
  ],
  createProvider: ({ provider, executor }) => provider ?? createHostExecutorShellExecutionMonitoringProvider(executor),
} as const satisfies ShellExecutionMonitoringProviderPractice;
