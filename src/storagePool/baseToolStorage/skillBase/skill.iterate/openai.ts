import { createHostExecutorSkillFilesystemProvider, type SkillIterateProviderPractice } from "./dependencies.js";

export const openaiSkillIteratePractice: SkillIterateProviderPractice = {
  providerName: "openai",
  source: { kind: "cli", label: "Codex skill instructions and explicit source paths", path: "/home/proview/Desktop/three/codex_rust_0_125_0/codex-rs/core/src/context/available_skills_instructions.rs" },
  directCliSupport: true,
  sideEffectPolicy: "runtime-governed",
  notes: ["Codex keeps skill bodies on disk and asks the agent to open only the needed SKILL.md and related files."],
  createProvider: (dependencies) => dependencies.provider ?? createHostExecutorSkillFilesystemProvider(dependencies.executor),
};
