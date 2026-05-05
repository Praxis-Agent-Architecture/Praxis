import type { BaseToolExecutorPort } from "../../../../../agentCore/agent_executionEngine/basic_toolLayer/baseTools/baseToolExecutorPort.js";
import type { BaseToolDependencyDeclaration } from "../../../../../agentCore/agent_executionEngine/basic_toolLayer/baseTools/baseToolDefinition.js";
import type { GitRevertCommitContext, GitRevertCommitProvider, GitRevertCommitProviderRequest } from "./core.js";

export type GitRevertCommitPracticeProviderName = "anthropic" | "openai" | "deepmind" | "praxis-native";

export type GitRevertCommitDependencies = {
  executor?: BaseToolExecutorPort;
  provider?: GitRevertCommitProvider;
};

export type GitRevertCommitProviderPractice = {
  providerName: GitRevertCommitPracticeProviderName;
  source: {
    kind: "cli" | "agent-sdk" | "api-sdk" | "praxis-native";
    label: string;
    path?: string;
  };
  directCliSupport: boolean;
  sideEffectPolicy: "destructive" | "history-mutation" | "runtime-governed";
  notes: readonly string[];
  createProvider(dependencies: GitRevertCommitDependencies): GitRevertCommitProvider | undefined;
};

export const gitRevertCommitDependencyDeclarations = [
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

export function createHostExecutorGitRevertCommitProvider(
  executor: BaseToolExecutorPort | undefined,
): GitRevertCommitProvider | undefined {
  const runGit = executor?.git?.runGit;
  if (runGit === undefined) {
    return undefined;
  }

  return async (request: GitRevertCommitProviderRequest, _context: GitRevertCommitContext) => {
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
