import type { BaseToolExecutorPort } from "../../../../../executionEngine/basic_toolLayer/baseTools/baseToolExecutorPort.js";
import type { BaseToolDependencyDeclaration } from "../../../../../executionEngine/basic_toolLayer/baseTools/baseToolDefinition.js";
import type {
  GitPushLocalChangesContext,
  GitPushLocalChangesProvider,
  GitPushLocalChangesProviderRequest,
} from "./core.js";

export type GitPushLocalChangesPracticeProviderName = "anthropic" | "openai" | "deepmind" | "praxis-native";

export type GitPushLocalChangesDependencies = {
  executor?: BaseToolExecutorPort;
  provider?: GitPushLocalChangesProvider;
};

export type GitPushLocalChangesProviderPractice = {
  providerName: GitPushLocalChangesPracticeProviderName;
  source: { kind: "cli" | "agent-sdk" | "api-sdk" | "praxis-native"; label: string; path?: string };
  directCliSupport: boolean;
  sideEffectPolicy: "remote-network" | "destructive" | "runtime-governed";
  notes: readonly string[];
  createProvider(dependencies: GitPushLocalChangesDependencies): GitPushLocalChangesProvider | undefined;
};

export const gitPushLocalChangesDependencyDeclarations = [
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
    description: "dryRun:false push requires an affirmative runtime guard before provider dispatch.",
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
    description: "Runtime-owned network egress policy for remote push operations.",
  },
] satisfies readonly BaseToolDependencyDeclaration[];

export function createHostExecutorGitPushLocalChangesProvider(
  executor: BaseToolExecutorPort | undefined,
): GitPushLocalChangesProvider | undefined {
  const runGit = executor?.git?.runGit;
  if (runGit === undefined) {
    return undefined;
  }

  return async (request: GitPushLocalChangesProviderRequest, _context: GitPushLocalChangesContext) => {
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
