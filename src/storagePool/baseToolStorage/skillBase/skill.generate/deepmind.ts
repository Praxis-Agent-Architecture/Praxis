import { createHostExecutorSkillFilesystemProvider, type SkillGenerateProviderPractice } from "./dependencies.js";

export const deepmindSkillGeneratePractice: SkillGenerateProviderPractice = {
  providerName: "deepmind",
  source: { kind: "cli", label: "Gemini CLI builtin skill-creator", path: "/home/proview/Desktop/three/gemini_cli_0_39_0/packages/core/src/skills/builtin/skill-creator" },
  directCliSupport: true,
  sideEffectPolicy: "runtime-governed",
  notes: ["Gemini ships skill-creator scripts for init, validate, and package workflows."],
  createProvider: (dependencies) => dependencies.provider ?? createHostExecutorSkillFilesystemProvider(dependencies.executor),
};
