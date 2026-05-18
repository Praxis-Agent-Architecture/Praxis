import { createHostExecutorSkillFilesystemProvider, type SkillManagementProviderPractice } from "./dependencies.js";

export const deepmindSkillManagementPractice: SkillManagementProviderPractice = {
  providerName: "deepmind",
  source: { kind: "cli", label: "Gemini CLI skills commands and activate_skill", path: "/home/proview/Desktop/three/gemini_cli_0_39_0/packages/cli/src/commands/skills" },
  directCliSupport: true,
  sideEffectPolicy: "runtime-governed",
  notes: ["Gemini has list, enable, disable, install, link, uninstall, and activation semantics for skills."],
  createProvider: (dependencies) => dependencies.provider ?? createHostExecutorSkillFilesystemProvider(dependencies.executor),
};
