import { createHostExecutorSkillFilesystemProvider, type SkillSummarizeProviderPractice } from "./dependencies.js";

export const anthropicSkillSummarizePractice: SkillSummarizeProviderPractice = {
  providerName: "anthropic",
  source: { kind: "cli", label: "Claude Code SkillTool prompt budget", path: "/home/proview/Desktop/three/claude_code_2_1_88/tools/SkillTool/prompt.ts" },
  directCliSupport: true,
  sideEffectPolicy: "read-only",
  notes: ["Claude lists skills with a small context budget and loads full content only on invocation."],
  createProvider: (dependencies) => dependencies.provider ?? createHostExecutorSkillFilesystemProvider(dependencies.executor),
};
