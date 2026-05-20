import type { BaseToolExecutorPort } from "../../../../../executionEngine/basic_toolLayer/baseTools/baseToolExecutorPort.js";
import type { BaseToolDependencyDeclaration } from "../../../../../executionEngine/basic_toolLayer/baseTools/baseToolDefinition.js";
import type {
  GitFetchRemoteUpdatesContext,
  GitFetchRemoteUpdatesProvider,
  GitFetchRemoteUpdatesProviderRequest,
} from "./core.js";

export type GitFetchRemoteUpdatesPracticeProviderName = "anthropic" | "openai" | "deepmind" | "praxis-native";

export type GitFetchRemoteUpdatesDependencies = {
  executor?: BaseToolExecutorPort;
  provider?: GitFetchRemoteUpdatesProvider;
};

export type GitFetchRemoteUpdatesProviderPractice = {
  providerName: GitFetchRemoteUpdatesPracticeProviderName;
  source: { kind: "cli" | "agent-sdk" | "api-sdk" | "praxis-native"; label: string; path?: string };
  directCliSupport: boolean;
  sideEffectPolicy: "remote-network" | "runtime-governed";
  notes: readonly string[];
  createProvider(dependencies: GitFetchRemoteUpdatesDependencies): GitFetchRemoteUpdatesProvider | undefined;
};

export const gitFetchRemoteUpdatesDependencyDeclarations = [
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
    description: "dryRun:false fetch requires an affirmative runtime guard before provider dispatch.",
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
    description: "Runtime-owned network egress policy for remote fetch operations.",
  },
] satisfies readonly BaseToolDependencyDeclaration[];

export function createHostExecutorGitFetchRemoteUpdatesProvider(
  executor: BaseToolExecutorPort | undefined,
): GitFetchRemoteUpdatesProvider | undefined {
  const runGit = executor?.git?.runGit;
  if (runGit === undefined) {
    return undefined;
  }

  return async (request: GitFetchRemoteUpdatesProviderRequest, _context: GitFetchRemoteUpdatesContext) => {
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
