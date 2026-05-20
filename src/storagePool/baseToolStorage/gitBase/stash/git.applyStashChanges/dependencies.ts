import type { BaseToolExecutorPort } from "../../../../../agentCore/agent_executionEngine/basic_toolLayer/baseTools/baseToolExecutorPort.js";
import type { BaseToolDependencyDeclaration } from "../../../../../agentCore/agent_executionEngine/basic_toolLayer/baseTools/baseToolDefinition.js";
import type {
  GitApplyStashChangesContext,
  GitApplyStashChangesProvider,
  GitApplyStashChangesProviderRequest,
} from "./core.js";

export type GitApplyStashChangesPracticeProviderName = "anthropic" | "openai" | "deepmind" | "praxis-native";

export type GitApplyStashChangesDependencies = {
  executor?: BaseToolExecutorPort;
  provider?: GitApplyStashChangesProvider;
};

export type GitApplyStashChangesProviderPractice = {
  providerName: GitApplyStashChangesPracticeProviderName;
  source: {
    kind: "cli" | "agent-sdk" | "api-sdk" | "praxis-native";
    label: string;
    path?: string;
  };
  directCliSupport: boolean;
  sideEffectPolicy: "workspace-mutation" | "runtime-governed";
  notes: readonly string[];
  createProvider(dependencies: GitApplyStashChangesDependencies): GitApplyStashChangesProvider | undefined;
};

export const gitApplyStashChangesDependencyDeclarations = [
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

export function createHostExecutorGitApplyStashChangesProvider(
  executor: BaseToolExecutorPort | undefined,
): GitApplyStashChangesProvider | undefined {
  const runGit = executor?.git?.runGit;
  if (runGit === undefined) {
    return undefined;
  }

  return async (request: GitApplyStashChangesProviderRequest, _context: GitApplyStashChangesContext) => {
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
