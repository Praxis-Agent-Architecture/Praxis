import type { BaseToolExecutorPort } from "../../../../../executionEngine/basic_toolLayer/baseTools/baseToolExecutorPort.js";
import type { BaseToolDependencyDeclaration } from "../../../../../executionEngine/basic_toolLayer/baseTools/baseToolDefinition.js";
import type { GitManageTagContext, GitManageTagProvider, GitManageTagProviderRequest } from "./core.js";

export type GitManageTagPracticeProviderName = "anthropic" | "openai" | "deepmind" | "praxis-native";

export type GitManageTagDependencies = {
  executor?: BaseToolExecutorPort;
  provider?: GitManageTagProvider;
};

export type GitManageTagProviderPractice = {
  providerName: GitManageTagPracticeProviderName;
  source: {
    kind: "cli" | "agent-sdk" | "api-sdk" | "praxis-native";
    label: string;
    path?: string;
  };
  directCliSupport: boolean;
  sideEffectPolicy: "destructive" | "history-mutation" | "runtime-governed";
  notes: readonly string[];
  createProvider(dependencies: GitManageTagDependencies): GitManageTagProvider | undefined;
};

export const gitManageTagDependencyDeclarations = [
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

export function createHostExecutorGitManageTagProvider(
  executor: BaseToolExecutorPort | undefined,
): GitManageTagProvider | undefined {
  const runGit = executor?.git?.runGit;
  if (runGit === undefined) {
    return undefined;
  }

  return async (request: GitManageTagProviderRequest, _context: GitManageTagContext) => {
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
