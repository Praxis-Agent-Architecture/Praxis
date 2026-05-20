import type { BaseToolExecutorPort } from "../../../../../agentCore_executionEngine/basic_toolLayer/baseTools/baseToolExecutorPort.js";
import type { BaseToolDependencyDeclaration } from "../../../../../agentCore_executionEngine/basic_toolLayer/baseTools/baseToolDefinition.js";
import type { GitCreateCommitContext, GitCreateCommitProvider, GitCreateCommitProviderRequest } from "./core.js";

export type GitCreateCommitPracticeProviderName = "anthropic" | "openai" | "deepmind" | "praxis-native";

export type GitCreateCommitDependencies = {
  executor?: BaseToolExecutorPort;
  provider?: GitCreateCommitProvider;
};

export type GitCreateCommitProviderPractice = {
  providerName: GitCreateCommitPracticeProviderName;
  source: {
    kind: "cli" | "agent-sdk" | "api-sdk" | "praxis-native";
    label: string;
    path?: string;
  };
  directCliSupport: boolean;
  sideEffectPolicy: "destructive" | "history-mutation" | "runtime-governed";
  notes: readonly string[];
  createProvider(dependencies: GitCreateCommitDependencies): GitCreateCommitProvider | undefined;
};

export const gitCreateCommitDependencyDeclarations = [
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

export function createHostExecutorGitCreateCommitProvider(
  executor: BaseToolExecutorPort | undefined,
): GitCreateCommitProvider | undefined {
  const runGit = executor?.git?.runGit;
  if (runGit === undefined) {
    return undefined;
  }

  return async (request: GitCreateCommitProviderRequest, _context: GitCreateCommitContext) => {
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
