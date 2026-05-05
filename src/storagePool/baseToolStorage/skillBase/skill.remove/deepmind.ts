import { createHostExecutorSkillFilesystemProvider, type SkillRemoveProviderPractice } from "./dependencies.js";

export const deepmindSkillRemovePractice: SkillRemoveProviderPractice = {
  providerName: "deepmind",
  source: { kind: "cli", label: "Gemini CLI skills uninstall/disable", path: "/home/proview/Desktop/three/gemini_cli_0_39_0/packages/cli/src/commands/skills/uninstall.ts" },
  directCliSupport: true,
  sideEffectPolicy: "runtime-governed",
  notes: ["Gemini distinguishes disabling from uninstalling a named skill in a scope."],
  createProvider: (dependencies) => dependencies.provider ?? createHostExecutorSkillFilesystemProvider(dependencies.executor),
};
