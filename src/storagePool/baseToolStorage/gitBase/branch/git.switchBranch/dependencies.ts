import type { BaseToolExecutorPort } from "../../../../../executionEngine/basic_toolLayer/baseTools/baseToolExecutorPort.js";
import type { BaseToolDependencyDeclaration } from "../../../../../executionEngine/basic_toolLayer/baseTools/baseToolDefinition.js";
import type {
  GitSwitchBranchContext,
  GitSwitchBranchProvider,
  GitSwitchBranchProviderRequest,
} from "./core.js";

export type GitSwitchBranchPracticeProviderName = "anthropic" | "openai" | "deepmind" | "praxis-native";

export type GitSwitchBranchDependencies = {
  executor?: BaseToolExecutorPort;
  provider?: GitSwitchBranchProvider;
};

export type GitSwitchBranchProviderPractice = {
  providerName: GitSwitchBranchPracticeProviderName;
  source: {
    kind: "cli" | "agent-sdk" | "api-sdk" | "praxis-native";
    label: string;
    path?: string;
  };
  directCliSupport: boolean;
  sideEffectPolicy: "destructive" | "workspace-mutation" | "runtime-governed";
  notes: readonly string[];
  createProvider(dependencies: GitSwitchBranchDependencies): GitSwitchBranchProvider | undefined;
};

export const gitSwitchBranchDependencyDeclarations = [
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

export function createHostExecutorGitSwitchBranchProvider(
  executor: BaseToolExecutorPort | undefined,
): GitSwitchBranchProvider | undefined {
  const runGit = executor?.git?.runGit;
  if (runGit === undefined) {
    return undefined;
  }

  return async (request: GitSwitchBranchProviderRequest, _context: GitSwitchBranchContext) => {
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
