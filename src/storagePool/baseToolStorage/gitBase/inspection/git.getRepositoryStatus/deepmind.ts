import {
  createHostExecutorGitRepositoryStatusProvider,
  type GitGetRepositoryStatusProviderPractice,
} from "./dependencies.js";

export const deepmindGitRepositoryStatusPractice: GitGetRepositoryStatusProviderPractice = {
  providerName: "deepmind",
  source: {
    kind: "cli",
    label: "Gemini CLI git service and worktree service",
    path: "/home/proview/Desktop/three/gemini_cli_0_39_0/packages/core/src/services/gitService.ts",
  },
  directCliSupport: true,
  sideEffectPolicy: "runtime-governed",
  notes: [
    "Gemini CLI checks git availability and isolates higher-risk repository state in runtime services.",
    "Praxis keeps git.getRepositoryStatus read-only but still dispatches through the runtime-owned git executor.",
  ],
  createProvider: ({ executor, provider }) => provider ?? createHostExecutorGitRepositoryStatusProvider(executor),
};
