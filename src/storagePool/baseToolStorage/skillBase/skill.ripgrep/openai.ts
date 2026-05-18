import { createHostExecutorSkillRipgrepProvider, type SkillRipgrepProviderPractice } from "./dependencies.js";

export const openaiSkillRipgrepPractice: SkillRipgrepProviderPractice = {
  providerName: "openai",
  source: { kind: "cli", label: "Codex skill roots and metadata search surface", path: "/home/proview/Desktop/three/codex_rust_0_125_0/codex-rs/core-skills/src/loader.rs" },
  directCliSupport: true,
  sideEffectPolicy: "read-only",
  notes: ["Codex discovers nested SKILL.md files; Praxis exposes explicit rg over the resulting skill roots."],
  createProvider: (dependencies) => dependencies.provider ?? createHostExecutorSkillRipgrepProvider(dependencies.executor),
};
