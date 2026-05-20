import type { BaseToolExecutorPort } from "../../../../../agentCore_executionEngine/basic_toolLayer/baseTools/baseToolExecutorPort.js";
import type { BaseToolDependencyDeclaration } from "../../../../../agentCore_executionEngine/basic_toolLayer/baseTools/baseToolDefinition.js";
import type {
  GitResetStagingOrCommitContext,
  GitResetStagingOrCommitProvider,
  GitResetStagingOrCommitProviderRequest,
} from "./core.js";

export type GitResetStagingOrCommitPracticeProviderName = "anthropic" | "openai" | "deepmind" | "praxis-native";

export type GitResetStagingOrCommitDependencies = {
  executor?: BaseToolExecutorPort;
  provider?: GitResetStagingOrCommitProvider;
};

export type GitResetStagingOrCommitProviderPractice = {
  providerName: GitResetStagingOrCommitPracticeProviderName;
  source: {
    kind: "cli" | "agent-sdk" | "api-sdk" | "praxis-native";
    label: string;
    path?: string;
  };
  directCliSupport: boolean;
  sideEffectPolicy: "workspace-mutation" | "history-mutation" | "destructive" | "runtime-governed";
  notes: readonly string[];
  createProvider(dependencies: GitResetStagingOrCommitDependencies): GitResetStagingOrCommitProvider | undefined;
};

export const gitResetStagingOrCommitDependencyDeclarations = [
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

export function createHostExecutorGitResetStagingOrCommitProvider(
  executor: BaseToolExecutorPort | undefined,
): GitResetStagingOrCommitProvider | undefined {
  const runGit = executor?.git?.runGit;
  if (runGit === undefined) {
    return undefined;
  }

  return async (request: GitResetStagingOrCommitProviderRequest, _context: GitResetStagingOrCommitContext) => {
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
