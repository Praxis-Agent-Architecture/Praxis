import type { BaseToolExecutorPort } from "../../../../../executionEngine/basic_toolLayer/baseTools/baseToolExecutorPort.js";
import type { BaseToolDependencyDeclaration } from "../../../../../executionEngine/basic_toolLayer/baseTools/baseToolDefinition.js";
import type {
  GitArchiveRepositoryContext,
  GitArchiveRepositoryProvider,
  GitArchiveRepositoryProviderRequest,
} from "./core.js";

export type GitArchiveRepositoryPracticeProviderName = "anthropic" | "openai" | "deepmind" | "praxis-native";

export type GitArchiveRepositoryDependencies = {
  executor?: BaseToolExecutorPort;
  provider?: GitArchiveRepositoryProvider;
};

export type GitArchiveRepositoryProviderPractice = {
  providerName: GitArchiveRepositoryPracticeProviderName;
  source: {
    kind: "cli" | "agent-sdk" | "api-sdk" | "praxis-native";
    label: string;
    path?: string;
  };
  directCliSupport: boolean;
  sideEffectPolicy: "workspace-mutation" | "runtime-governed";
  notes: readonly string[];
  createProvider(dependencies: GitArchiveRepositoryDependencies): GitArchiveRepositoryProvider | undefined;
};

export const gitArchiveRepositoryDependencyDeclarations = [
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

export function createHostExecutorGitArchiveRepositoryProvider(
  executor: BaseToolExecutorPort | undefined,
): GitArchiveRepositoryProvider | undefined {
  const runGit = executor?.git?.runGit;
  if (runGit === undefined) {
    return undefined;
  }

  return async (request: GitArchiveRepositoryProviderRequest, _context: GitArchiveRepositoryContext) => {
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
