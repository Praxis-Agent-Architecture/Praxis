import { createHostExecutorSkillFilesystemProvider, type SkillSummarizeProviderPractice } from "./dependencies.js";

export const deepmindSkillSummarizePractice: SkillSummarizeProviderPractice = {
  providerName: "deepmind",
  source: { kind: "cli", label: "Gemini available skills snippets", path: "/home/proview/Desktop/three/gemini_cli_0_39_0/packages/core/src/prompts/snippets.ts" },
  directCliSupport: true,
  sideEffectPolicy: "read-only",
  notes: ["Gemini exposes name, description, and location first; activation loads the body later."],
  createProvider: (dependencies) => dependencies.provider ?? createHostExecutorSkillFilesystemProvider(dependencies.executor),
};
