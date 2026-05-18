import type { BaseToolExecutorPort } from "../../../../../agentCore/agent_executionEngine/basic_toolLayer/baseTools/baseToolExecutorPort.js";
import type { BaseToolDependencyDeclaration } from "../../../../../agentCore/agent_executionEngine/basic_toolLayer/baseTools/baseToolDefinition.js";
import type { GitCommitHistoryProvider, GitCommitHistoryProviderRequest, GitGetCommitHistoryContext } from "./core.js";

export type GitGetCommitHistoryPracticeProviderName = "anthropic" | "openai" | "deepmind" | "praxis-native";

export type GitGetCommitHistoryDependencies = {
  executor?: BaseToolExecutorPort;
  provider?: GitCommitHistoryProvider;
};

export type GitGetCommitHistoryProviderPractice = {
  providerName: GitGetCommitHistoryPracticeProviderName;
  source: {
    kind: "cli" | "agent-sdk" | "api-sdk" | "praxis-native";
    label: string;
    path?: string;
  };
  directCliSupport: boolean;
  sideEffectPolicy: "read-only" | "runtime-governed";
  notes: readonly string[];
  createProvider(dependencies: GitGetCommitHistoryDependencies): GitCommitHistoryProvider | undefined;
};

export const gitGetCommitHistoryDependencyDeclarations = [
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

export function createHostExecutorGitCommitHistoryProvider(
  executor: BaseToolExecutorPort | undefined,
): GitCommitHistoryProvider | undefined {
  const runGit = executor?.git?.runGit;
  if (runGit === undefined) {
    return undefined;
  }

  return async (request: GitCommitHistoryProviderRequest, _context: GitGetCommitHistoryContext) => {
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
