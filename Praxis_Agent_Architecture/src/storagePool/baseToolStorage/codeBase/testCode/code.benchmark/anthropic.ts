import { createHostExecutorCodeBenchmarkProvider, type CodeBenchmarkProviderPractice } from "./dependencies.js";

export const anthropicCodeBenchmarkPractice: CodeBenchmarkProviderPractice = {
  providerName: "anthropic",
  source: { kind: "cli", label: "Claude Code fixed benchmark tool practice" },
  directCliSupport: true,
  sideEffectPolicy: "runtime-governed",
  notes: ["Benchmarks should be requested through a fixed tool contract; storage owns iterations and summary semantics."],
  createProvider: ({ provider, executor }) => provider ?? createHostExecutorCodeBenchmarkProvider(executor),
};
