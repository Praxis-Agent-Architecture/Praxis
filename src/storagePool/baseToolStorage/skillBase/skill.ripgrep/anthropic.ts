import { createHostExecutorSkillRipgrepProvider, type SkillRipgrepProviderPractice } from "./dependencies.js";

export const anthropicSkillRipgrepPractice: SkillRipgrepProviderPractice = {
  providerName: "anthropic",
  source: { kind: "cli", label: "Claude Code skillify allowed Grep/Glob workflow", path: "/home/proview/Desktop/three/claude_code_2_1_88/skills/bundled/skillify.ts" },
  directCliSupport: true,
  sideEffectPolicy: "read-only",
  notes: ["Claude skills commonly rely on Grep/Glob to inspect session and repository material before creating skills."],
  createProvider: (dependencies) => dependencies.provider ?? createHostExecutorSkillRipgrepProvider(dependencies.executor),
};
