import { createHostExecutorCodeBenchmarkProvider, type CodeBenchmarkProviderPractice } from "./dependencies.js";

export const openaiCodeBenchmarkPractice: CodeBenchmarkProviderPractice = {
  providerName: "openai",
  source: { kind: "cli", label: "Codex precise schema benchmark practice" },
  directCliSupport: true,
  sideEffectPolicy: "runtime-governed",
  notes: ["Codex-style calls should carry a benchmark target, bounded iterations, and guard metadata."],
  createProvider: ({ provider, executor }) => provider ?? createHostExecutorCodeBenchmarkProvider(executor),
};
