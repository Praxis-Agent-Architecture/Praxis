import { createHostExecutorSkillFilesystemProvider, type SkillGenerateProviderPractice } from "./dependencies.js";

export const anthropicSkillGeneratePractice: SkillGenerateProviderPractice = {
  providerName: "anthropic",
  source: { kind: "cli", label: "Claude Code skillify bundled skill", path: "/home/proview/Desktop/three/claude_code_2_1_88/skills/bundled/skillify.ts" },
  directCliSupport: true,
  sideEffectPolicy: "runtime-governed",
  notes: ["Claude Code captures repeatable workflows into SKILL.md with allowed-tools and when_to_use metadata."],
  createProvider: (dependencies) => dependencies.provider ?? createHostExecutorSkillFilesystemProvider(dependencies.executor),
};
