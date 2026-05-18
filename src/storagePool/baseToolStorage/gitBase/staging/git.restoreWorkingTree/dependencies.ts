import type { BaseToolExecutorPort } from "../../../../../agentCore/agent_executionEngine/basic_toolLayer/baseTools/baseToolExecutorPort.js";
import type { BaseToolDependencyDeclaration } from "../../../../../agentCore/agent_executionEngine/basic_toolLayer/baseTools/baseToolDefinition.js";
import type {
  GitRestoreWorkingTreeContext,
  GitRestoreWorkingTreeProvider,
  GitRestoreWorkingTreeProviderRequest,
} from "./core.js";

export type GitRestoreWorkingTreePracticeProviderName = "anthropic" | "openai" | "deepmind" | "praxis-native";

export type GitRestoreWorkingTreeDependencies = {
  executor?: BaseToolExecutorPort;
  provider?: GitRestoreWorkingTreeProvider;
};

export type GitRestoreWorkingTreeProviderPractice = {
  providerName: GitRestoreWorkingTreePracticeProviderName;
  source: {
    kind: "cli" | "agent-sdk" | "api-sdk" | "praxis-native";
    label: string;
    path?: string;
  };
  directCliSupport: boolean;
  sideEffectPolicy: "workspace-mutation" | "runtime-governed";
  notes: readonly string[];
  createProvider(dependencies: GitRestoreWorkingTreeDependencies): GitRestoreWorkingTreeProvider | undefined;
};

export const gitRestoreWorkingTreeDependencyDeclarations = [
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

export function createHostExecutorGitRestoreWorkingTreeProvider(
  executor: BaseToolExecutorPort | undefined,
): GitRestoreWorkingTreeProvider | undefined {
  const runGit = executor?.git?.runGit;
  if (runGit === undefined) {
    return undefined;
  }

  return async (request: GitRestoreWorkingTreeProviderRequest, _context: GitRestoreWorkingTreeContext) => {
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
