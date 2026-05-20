import type { BaseToolExecutorPort } from "../../../../../agentCore_executionEngine/basic_toolLayer/baseTools/baseToolExecutorPort.js";
import type { BaseToolDependencyDeclaration } from "../../../../../agentCore_executionEngine/basic_toolLayer/baseTools/baseToolDefinition.js";
import type { GitManageWorktreeContext, GitManageWorktreeProvider, GitManageWorktreeProviderRequest } from "./core.js";

export type GitManageWorktreePracticeProviderName = "anthropic" | "openai" | "deepmind" | "praxis-native";

export type GitManageWorktreeDependencies = {
  executor?: BaseToolExecutorPort;
  provider?: GitManageWorktreeProvider;
};

export type GitManageWorktreeProviderPractice = {
  providerName: GitManageWorktreePracticeProviderName;
  source: { kind: "cli" | "agent-sdk" | "api-sdk" | "praxis-native"; label: string; path?: string };
  directCliSupport: boolean;
  sideEffectPolicy: "read-only-inspection" | "workspace-mutation" | "destructive" | "runtime-governed";
  notes: readonly string[];
  createProvider(dependencies: GitManageWorktreeDependencies): GitManageWorktreeProvider | undefined;
};

export const gitManageWorktreeDependencyDeclarations = [
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
    description: "dryRun:false mutations require an affirmative runtime guard before provider dispatch.",
  },
  {
    dependencyId: "git",
    kind: "binary",
    required: true,
    description: "Host git binary used by the runtime-owned git executor.",
  },
] satisfies readonly BaseToolDependencyDeclaration[];

export function createHostExecutorGitManageWorktreeProvider(
  executor: BaseToolExecutorPort | undefined,
): GitManageWorktreeProvider | undefined {
  const runGit = executor?.git?.runGit;
  if (runGit === undefined) {
    return undefined;
  }

  return async (request: GitManageWorktreeProviderRequest, _context: GitManageWorktreeContext) => {
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
