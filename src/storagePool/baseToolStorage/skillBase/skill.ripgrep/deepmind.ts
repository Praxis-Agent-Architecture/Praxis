import { createHostExecutorSkillRipgrepProvider, type SkillRipgrepProviderPractice } from "./dependencies.js";

export const deepmindSkillRipgrepPractice: SkillRipgrepProviderPractice = {
  providerName: "deepmind",
  source: { kind: "cli", label: "Gemini skill extraction agent grep/glob practice", path: "/home/proview/Desktop/three/gemini_cli_0_39_0/packages/core/src/agents/skill-extraction-agent.ts" },
  directCliSupport: true,
  sideEffectPolicy: "read-only",
  notes: ["Gemini maps search and extraction into skill generation; Praxis keeps rg as its own primitive."],
  createProvider: (dependencies) => dependencies.provider ?? createHostExecutorSkillRipgrepProvider(dependencies.executor),
};
