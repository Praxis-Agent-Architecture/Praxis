import type { BaseToolExecutorPort } from "../../../../../agentCore_executionEngine/basic_toolLayer/baseTools/baseToolExecutorPort.js";
import type { BaseToolDependencyDeclaration } from "../../../../../agentCore_executionEngine/basic_toolLayer/baseTools/baseToolDefinition.js";
import type {
  GitShowObjectDetailsContext,
  GitShowObjectDetailsProvider,
  GitShowObjectDetailsProviderRequest,
} from "./core.js";

export type GitShowObjectDetailsPracticeProviderName = "anthropic" | "openai" | "deepmind" | "praxis-native";

export type GitShowObjectDetailsDependencies = {
  executor?: BaseToolExecutorPort;
  provider?: GitShowObjectDetailsProvider;
};

export type GitShowObjectDetailsProviderPractice = {
  providerName: GitShowObjectDetailsPracticeProviderName;
  source: {
    kind: "cli" | "agent-sdk" | "api-sdk" | "praxis-native";
    label: string;
    path?: string;
  };
  directCliSupport: boolean;
  sideEffectPolicy: "read-only" | "runtime-governed";
  notes: readonly string[];
  createProvider(dependencies: GitShowObjectDetailsDependencies): GitShowObjectDetailsProvider | undefined;
};

export const gitShowObjectDetailsDependencyDeclarations = [
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

export function createHostExecutorGitShowObjectDetailsProvider(
  executor: BaseToolExecutorPort | undefined,
): GitShowObjectDetailsProvider | undefined {
  const runGit = executor?.git?.runGit;
  if (runGit === undefined) {
    return undefined;
  }

  return async (request: GitShowObjectDetailsProviderRequest, _context: GitShowObjectDetailsContext) => {
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
