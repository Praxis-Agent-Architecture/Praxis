import type { BaseToolExecutorPort } from "../../../../../agentCore_executionEngine/basic_toolLayer/baseTools/baseToolExecutorPort.js";
import type { BaseToolDependencyDeclaration } from "../../../../../agentCore_executionEngine/basic_toolLayer/baseTools/baseToolDefinition.js";
import type { GitManageBranchContext, GitManageBranchProvider, GitManageBranchProviderRequest } from "./core.js";

export type GitManageBranchPracticeProviderName = "anthropic" | "openai" | "deepmind" | "praxis-native";

export type GitManageBranchDependencies = {
  executor?: BaseToolExecutorPort;
  provider?: GitManageBranchProvider;
};

export type GitManageBranchProviderPractice = {
  providerName: GitManageBranchPracticeProviderName;
  source: {
    kind: "cli" | "agent-sdk" | "api-sdk" | "praxis-native";
    label: string;
    path?: string;
  };
  directCliSupport: boolean;
  sideEffectPolicy: "destructive" | "history-mutation" | "runtime-governed";
  notes: readonly string[];
  createProvider(dependencies: GitManageBranchDependencies): GitManageBranchProvider | undefined;
};

export const gitManageBranchDependencyDeclarations = [
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

export function createHostExecutorGitManageBranchProvider(
  executor: BaseToolExecutorPort | undefined,
): GitManageBranchProvider | undefined {
  const runGit = executor?.git?.runGit;
  if (runGit === undefined) {
    return undefined;
  }

  return async (request: GitManageBranchProviderRequest, _context: GitManageBranchContext) => {
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
