import type { BaseToolExecutorPort } from "../../../../../agentCore_executionEngine/basic_toolLayer/baseTools/baseToolExecutorPort.js";
import type { BaseToolDependencyDeclaration } from "../../../../../agentCore_executionEngine/basic_toolLayer/baseTools/baseToolDefinition.js";
import type { GitMergeBranchContext, GitMergeBranchProvider, GitMergeBranchProviderRequest } from "./core.js";

export type GitMergeBranchPracticeProviderName = "anthropic" | "openai" | "deepmind" | "praxis-native";

export type GitMergeBranchDependencies = {
  executor?: BaseToolExecutorPort;
  provider?: GitMergeBranchProvider;
};

export type GitMergeBranchProviderPractice = {
  providerName: GitMergeBranchPracticeProviderName;
  source: {
    kind: "cli" | "agent-sdk" | "api-sdk" | "praxis-native";
    label: string;
    path?: string;
  };
  directCliSupport: boolean;
  sideEffectPolicy: "destructive" | "workspace-mutation" | "runtime-governed";
  notes: readonly string[];
  createProvider(dependencies: GitMergeBranchDependencies): GitMergeBranchProvider | undefined;
};

export const gitMergeBranchDependencyDeclarations = [
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

export function createHostExecutorGitMergeBranchProvider(
  executor: BaseToolExecutorPort | undefined,
): GitMergeBranchProvider | undefined {
  const runGit = executor?.git?.runGit;
  if (runGit === undefined) {
    return undefined;
  }

  return async (request: GitMergeBranchProviderRequest, _context: GitMergeBranchContext) => {
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
