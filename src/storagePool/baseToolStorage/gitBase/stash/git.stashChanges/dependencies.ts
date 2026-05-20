import type { BaseToolExecutorPort } from "../../../../../executionEngine/basic_toolLayer/baseTools/baseToolExecutorPort.js";
import type { BaseToolDependencyDeclaration } from "../../../../../executionEngine/basic_toolLayer/baseTools/baseToolDefinition.js";
import type { GitStashChangesContext, GitStashChangesProvider, GitStashChangesProviderRequest } from "./core.js";

export type GitStashChangesPracticeProviderName = "anthropic" | "openai" | "deepmind" | "praxis-native";

export type GitStashChangesDependencies = {
  executor?: BaseToolExecutorPort;
  provider?: GitStashChangesProvider;
};

export type GitStashChangesProviderPractice = {
  providerName: GitStashChangesPracticeProviderName;
  source: {
    kind: "cli" | "agent-sdk" | "api-sdk" | "praxis-native";
    label: string;
    path?: string;
  };
  directCliSupport: boolean;
  sideEffectPolicy: "workspace-mutation" | "runtime-governed";
  notes: readonly string[];
  createProvider(dependencies: GitStashChangesDependencies): GitStashChangesProvider | undefined;
};

export const gitStashChangesDependencyDeclarations = [
  {
    dependencyId: "runtime.execEngine.git.runGit",
    kind: "runtime",
    required: true,
    description: "Runtime-provided git executor exposed through BaseToolExecutorPort.git.runGit",
  },
  {
    dependencyId: "runtime.governancePlane.toolInvocationGrant",
    kind: "permission",
    required: true,
    description: "dryRun:false requires an affirmative runtime guard before provider dispatch.",
  },
  {
    dependencyId: "git",
    kind: "binary",
    required: true,
    description: "Host git binary used by the runtime-owned git executor.",
  },
] satisfies readonly BaseToolDependencyDeclaration[];

export function createHostExecutorGitStashChangesProvider(
  executor: BaseToolExecutorPort | undefined,
): GitStashChangesProvider | undefined {
  const runGit = executor?.git?.runGit;
  if (runGit === undefined) {
    return undefined;
  }

  return async (request: GitStashChangesProviderRequest, _context: GitStashChangesContext) => {
    const result = await runGit({
      repositoryPath: request.repositoryPath,
      args: request.args,
      timeoutMs: request.timeoutMs,
    });

    if (!result.ok) {
      throw new Error(result.error.message);
    }

    return result.output;
  };
}
