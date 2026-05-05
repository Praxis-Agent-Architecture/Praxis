import { createHostExecutorSkillFilesystemProvider, type SkillRemoveProviderPractice } from "./dependencies.js";

export const openaiSkillRemovePractice: SkillRemoveProviderPractice = {
  providerName: "openai",
  source: { kind: "cli", label: "Codex skills config rules", path: "/home/proview/Desktop/three/codex_rust_0_125_0/codex-rs/core-skills/src/config_rules.rs" },
  directCliSupport: true,
  sideEffectPolicy: "runtime-governed",
  notes: ["Codex supports path/name enabled rules; Praxis remove keeps disable separate from unlink/purge."],
  createProvider: (dependencies) => dependencies.provider ?? createHostExecutorSkillFilesystemProvider(dependencies.executor),
};
