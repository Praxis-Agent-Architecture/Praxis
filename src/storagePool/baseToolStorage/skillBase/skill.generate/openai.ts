import { createHostExecutorSkillFilesystemProvider, type SkillGenerateProviderPractice } from "./dependencies.js";

export const openaiSkillGeneratePractice: SkillGenerateProviderPractice = {
  providerName: "openai",
  source: { kind: "cli", label: "Codex Rust core-skills loader and plugin skill roots", path: "/home/proview/Desktop/three/codex_rust_0_125_0/codex-rs/core-skills/src/loader.rs" },
  directCliSupport: true,
  sideEffectPolicy: "runtime-governed",
  notes: ["Codex treats SKILL.md as local instruction packages under user, repo, system, and plugin skill roots."],
  createProvider: (dependencies) => dependencies.provider ?? createHostExecutorSkillFilesystemProvider(dependencies.executor),
};
