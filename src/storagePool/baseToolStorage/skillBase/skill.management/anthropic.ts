import { createHostExecutorSkillFilesystemProvider, type SkillManagementProviderPractice } from "./dependencies.js";

export const anthropicSkillManagementPractice: SkillManagementProviderPractice = {
  providerName: "anthropic",
  source: { kind: "cli", label: "Claude Code SkillTool and /skills menu", path: "/home/proview/Desktop/three/claude_code_2_1_88/tools/SkillTool/SkillTool.ts" },
  directCliSupport: true,
  sideEffectPolicy: "runtime-governed",
  notes: ["Claude exposes model invocation through SkillTool and user listing through /skills."],
  createProvider: (dependencies) => dependencies.provider ?? createHostExecutorSkillFilesystemProvider(dependencies.executor),
};
