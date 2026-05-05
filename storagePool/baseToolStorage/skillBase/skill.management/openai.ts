import { createHostExecutorSkillFilesystemProvider, type SkillManagementProviderPractice } from "./dependencies.js";

export const openaiSkillManagementPractice: SkillManagementProviderPractice = {
  providerName: "openai",
  source: { kind: "cli", label: "Codex skills manager, config rules, and injection", path: "/home/proview/Desktop/three/codex_rust_0_125_0/codex-rs/core-skills/src/manager.rs" },
  directCliSupport: true,
  sideEffectPolicy: "runtime-governed",
  notes: ["Codex loads skills by scope, resolves disabled config, and injects explicitly mentioned skills."],
  createProvider: (dependencies) => dependencies.provider ?? createHostExecutorSkillFilesystemProvider(dependencies.executor),
};
