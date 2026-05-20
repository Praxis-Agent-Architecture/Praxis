import type { BaseToolExecutorPort } from "../../../../../executionEngine/basic_toolLayer/baseTools/baseToolExecutorPort.js";
import type { BaseToolDependencyDeclaration } from "../../../../../executionEngine/basic_toolLayer/baseTools/baseToolDefinition.js";
import type {
  GitGetRepositoryStatusContext,
  GitRepositoryStatusProvider,
  GitRepositoryStatusProviderRequest,
} from "./core.js";

export type GitGetRepositoryStatusPracticeProviderName = "anthropic" | "openai" | "deepmind" | "praxis-native";

export type GitGetRepositoryStatusDependencies = {
  executor?: BaseToolExecutorPort;
  provider?: GitRepositoryStatusProvider;
};

export type GitGetRepositoryStatusProviderPractice = {
  providerName: GitGetRepositoryStatusPracticeProviderName;
  source: {
    kind: "cli" | "agent-sdk" | "api-sdk" | "praxis-native";
    label: string;
    path?: string;
  };
  directCliSupport: boolean;
  sideEffectPolicy: "read-only" | "runtime-governed";
  notes: readonly string[];
  createProvider(dependencies: GitGetRepositoryStatusDependencies): GitRepositoryStatusProvider | undefined;
};

export const gitGetRepositoryStatusDependencyDeclarations = [
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

export function createHostExecutorGitRepositoryStatusProvider(
  executor: BaseToolExecutorPort | undefined,
): GitRepositoryStatusProvider | undefined {
  const runGit = executor?.git?.runGit;
  if (runGit === undefined) {
    return undefined;
  }

  return async (request: GitRepositoryStatusProviderRequest, _context: GitGetRepositoryStatusContext) => {
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
