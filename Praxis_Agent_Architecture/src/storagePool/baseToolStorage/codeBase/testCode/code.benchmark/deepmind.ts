import { createHostExecutorCodeBenchmarkProvider, type CodeBenchmarkProviderPractice } from "./dependencies.js";

export const deepmindCodeBenchmarkPractice: CodeBenchmarkProviderPractice = {
  providerName: "deepmind",
  source: { kind: "cli", label: "Gemini CLI benchmark intent practice" },
  directCliSupport: true,
  sideEffectPolicy: "runtime-governed",
  notes: ["Gemini-style command intent is translated into fixed benchmark schema and runtime process support."],
  createProvider: ({ provider, executor }) => provider ?? createHostExecutorCodeBenchmarkProvider(executor),
};
