import type { BaseToolExecutorPort } from "../../../../../executionEngine/basic_toolLayer/baseTools/baseToolExecutorPort.js";
import type { BaseToolDependencyDeclaration } from "../../../../../executionEngine/basic_toolLayer/baseTools/baseToolDefinition.js";
import type {
  GitPopStashChangesContext,
  GitPopStashChangesProvider,
  GitPopStashChangesProviderRequest,
} from "./core.js";

export type GitPopStashChangesPracticeProviderName = "anthropic" | "openai" | "deepmind" | "praxis-native";

export type GitPopStashChangesDependencies = {
  executor?: BaseToolExecutorPort;
  provider?: GitPopStashChangesProvider;
};

export type GitPopStashChangesProviderPractice = {
  providerName: GitPopStashChangesPracticeProviderName;
  source: {
    kind: "cli" | "agent-sdk" | "api-sdk" | "praxis-native";
    label: string;
    path?: string;
  };
  directCliSupport: boolean;
  sideEffectPolicy: "workspace-mutation" | "runtime-governed";
  notes: readonly string[];
  createProvider(dependencies: GitPopStashChangesDependencies): GitPopStashChangesProvider | undefined;
};

export const gitPopStashChangesDependencyDeclarations = [
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

export function createHostExecutorGitPopStashChangesProvider(
  executor: BaseToolExecutorPort | undefined,
): GitPopStashChangesProvider | undefined {
  const runGit = executor?.git?.runGit;
  if (runGit === undefined) {
    return undefined;
  }

  return async (request: GitPopStashChangesProviderRequest, _context: GitPopStashChangesContext) => {
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
