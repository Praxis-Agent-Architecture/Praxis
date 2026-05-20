import type { BaseToolExecutorPort } from "../../../../../executionEngine/basic_toolLayer/baseTools/baseToolExecutorPort.js";
import type { BaseToolDependencyDeclaration } from "../../../../../executionEngine/basic_toolLayer/baseTools/baseToolDefinition.js";
import type {
  GitPullRemoteChangesContext,
  GitPullRemoteChangesProvider,
  GitPullRemoteChangesProviderRequest,
} from "./core.js";

export type GitPullRemoteChangesPracticeProviderName = "anthropic" | "openai" | "deepmind" | "praxis-native";

export type GitPullRemoteChangesDependencies = {
  executor?: BaseToolExecutorPort;
  provider?: GitPullRemoteChangesProvider;
};

export type GitPullRemoteChangesProviderPractice = {
  providerName: GitPullRemoteChangesPracticeProviderName;
  source: { kind: "cli" | "agent-sdk" | "api-sdk" | "praxis-native"; label: string; path?: string };
  directCliSupport: boolean;
  sideEffectPolicy: "remote-network" | "runtime-governed";
  notes: readonly string[];
  createProvider(dependencies: GitPullRemoteChangesDependencies): GitPullRemoteChangesProvider | undefined;
};

export const gitPullRemoteChangesDependencyDeclarations = [
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
    description: "dryRun:false pull requires an affirmative runtime guard before provider dispatch.",
  },
  {
    dependencyId: "git",
    kind: "binary",
    required: true,
    description: "Host git binary used by the runtime-owned git executor.",
  },
  {
    dependencyId: "network.egress",
    kind: "runtime",
    required: true,
    description: "Runtime-owned network egress policy for remote pull operations.",
  },
] satisfies readonly BaseToolDependencyDeclaration[];

export function createHostExecutorGitPullRemoteChangesProvider(
  executor: BaseToolExecutorPort | undefined,
): GitPullRemoteChangesProvider | undefined {
  const runGit = executor?.git?.runGit;
  if (runGit === undefined) {
    return undefined;
  }

  return async (request: GitPullRemoteChangesProviderRequest, _context: GitPullRemoteChangesContext) => {
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
