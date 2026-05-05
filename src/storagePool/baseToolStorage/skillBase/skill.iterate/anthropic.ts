import { createHostExecutorSkillFilesystemProvider, type SkillIterateProviderPractice } from "./dependencies.js";

export const anthropicSkillIteratePractice: SkillIterateProviderPractice = {
  providerName: "anthropic",
  source: { kind: "cli", label: "Claude Code skillify iterative interview", path: "/home/proview/Desktop/three/claude_code_2_1_88/skills/bundled/skillify.ts" },
  directCliSupport: true,
  sideEffectPolicy: "runtime-governed",
  notes: ["Claude skillify stresses review, success criteria, and user corrections before saving SKILL.md."],
  createProvider: (dependencies) => dependencies.provider ?? createHostExecutorSkillFilesystemProvider(dependencies.executor),
};
