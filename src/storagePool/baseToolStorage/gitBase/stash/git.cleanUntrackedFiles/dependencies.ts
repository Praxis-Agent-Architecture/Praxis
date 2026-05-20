import type { BaseToolExecutorPort } from "../../../../../agentCore_executionEngine/basic_toolLayer/baseTools/baseToolExecutorPort.js";
import type { BaseToolDependencyDeclaration } from "../../../../../agentCore_executionEngine/basic_toolLayer/baseTools/baseToolDefinition.js";
import type {
  GitCleanUntrackedFilesContext,
  GitCleanUntrackedFilesProvider,
  GitCleanUntrackedFilesProviderRequest,
} from "./core.js";

export type GitCleanUntrackedFilesPracticeProviderName = "anthropic" | "openai" | "deepmind" | "praxis-native";

export type GitCleanUntrackedFilesDependencies = {
  executor?: BaseToolExecutorPort;
  provider?: GitCleanUntrackedFilesProvider;
};

export type GitCleanUntrackedFilesProviderPractice = {
  providerName: GitCleanUntrackedFilesPracticeProviderName;
  source: {
    kind: "cli" | "agent-sdk" | "api-sdk" | "praxis-native";
    label: string;
    path?: string;
  };
  directCliSupport: boolean;
  sideEffectPolicy: "destructive" | "workspace-mutation" | "runtime-governed";
  notes: readonly string[];
  createProvider(dependencies: GitCleanUntrackedFilesDependencies): GitCleanUntrackedFilesProvider | undefined;
};

export const gitCleanUntrackedFilesDependencyDeclarations = [
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

export function createHostExecutorGitCleanUntrackedFilesProvider(
  executor: BaseToolExecutorPort | undefined,
): GitCleanUntrackedFilesProvider | undefined {
  const runGit = executor?.git?.runGit;
  if (runGit === undefined) {
    return undefined;
  }

  return async (request: GitCleanUntrackedFilesProviderRequest, _context: GitCleanUntrackedFilesContext) => {
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
