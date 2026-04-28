import {
  createHostExecutorGitRepositoryStatusProvider,
  type GitGetRepositoryStatusProviderPractice,
} from "./dependencies.js";

export const anthropicGitRepositoryStatusPractice: GitGetRepositoryStatusProviderPractice = {
  providerName: "anthropic",
  source: {
    kind: "cli",
    label: "Claude Code git utilities and shell-governed git execution",
    path: "/home/proview/Desktop/three/claude_code_2_1_88/utils/git.ts",
  },
  directCliSupport: true,
  sideEffectPolicy: "runtime-governed",
  notes: [
    "Claude Code treats git status, branch, and repository state as host-owned git interactions.",
    "Praxis stores status semantics in core.ts and calls only the injected runtime git executor.",
  ],
  createProvider: ({ executor, provider }) => provider ?? createHostExecutorGitRepositoryStatusProvider(executor),
};
