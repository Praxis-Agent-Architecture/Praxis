import { createHostExecutorSkillFilesystemProvider, type SkillRemoveProviderPractice } from "./dependencies.js";

export const anthropicSkillRemovePractice: SkillRemoveProviderPractice = {
  providerName: "anthropic",
  source: { kind: "cli", label: "Claude Code managed/user/project skill roots", path: "/home/proview/Desktop/three/claude_code_2_1_88/skills/loadSkillsDir.ts" },
  directCliSupport: true,
  sideEffectPolicy: "runtime-governed",
  notes: ["Claude separates skill discovery roots, so remove semantics should be root-scoped and guarded."],
  createProvider: (dependencies) => dependencies.provider ?? createHostExecutorSkillFilesystemProvider(dependencies.executor),
};
