import { createHostExecutorSkillFilesystemProvider, type SkillSummarizeProviderPractice } from "./dependencies.js";

export const openaiSkillSummarizePractice: SkillSummarizeProviderPractice = {
  providerName: "openai",
  source: { kind: "cli", label: "Codex skill render budget", path: "/home/proview/Desktop/three/codex_rust_0_125_0/codex-rs/core-skills/src/render.rs" },
  directCliSupport: true,
  sideEffectPolicy: "read-only",
  notes: ["Codex renders model-visible skill lines with a 2 percent context budget and truncation warnings."],
  createProvider: (dependencies) => dependencies.provider ?? createHostExecutorSkillFilesystemProvider(dependencies.executor),
};
