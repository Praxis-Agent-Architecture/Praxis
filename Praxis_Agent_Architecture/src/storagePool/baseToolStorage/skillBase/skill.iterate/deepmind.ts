import { createHostExecutorSkillFilesystemProvider, type SkillIterateProviderPractice } from "./dependencies.js";

export const deepmindSkillIteratePractice: SkillIterateProviderPractice = {
  providerName: "deepmind",
  source: { kind: "cli", label: "Gemini skill-creator validate/package scripts", path: "/home/proview/Desktop/three/gemini_cli_0_39_0/packages/core/src/skills/builtin/skill-creator/scripts" },
  directCliSupport: true,
  sideEffectPolicy: "runtime-governed",
  notes: ["Gemini validates and packages skill updates as filesystem-backed SKILL.md assets."],
  createProvider: (dependencies) => dependencies.provider ?? createHostExecutorSkillFilesystemProvider(dependencies.executor),
};
