import {
  createHostExecutorGitRepositoryStatusProvider,
  type GitGetRepositoryStatusProviderPractice,
} from "./dependencies.js";

export const openaiGitRepositoryStatusPractice: GitGetRepositoryStatusProviderPractice = {
  providerName: "openai",
  source: {
    kind: "cli",
    label: "Codex Rust git-utils repository checks and git command wrapper",
    path: "/home/proview/Desktop/three/codex_rust_0_125_0/codex-rs/git-utils/src/operations.rs",
  },
  directCliSupport: true,
  sideEffectPolicy: "runtime-governed",
  notes: [
    "Codex keeps repository validation and git command execution behind utility boundaries.",
    "Praxis maps that practice to BaseToolGitExecutor.runGit rather than hidden local execution.",
  ],
  createProvider: ({ executor, provider }) => provider ?? createHostExecutorGitRepositoryStatusProvider(executor),
};
