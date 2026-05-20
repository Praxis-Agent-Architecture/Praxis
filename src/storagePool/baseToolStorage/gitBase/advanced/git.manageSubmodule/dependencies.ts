import type { BaseToolExecutorPort } from "../../../../../executionEngine/basic_toolLayer/baseTools/baseToolExecutorPort.js";
import type { BaseToolDependencyDeclaration } from "../../../../../executionEngine/basic_toolLayer/baseTools/baseToolDefinition.js";
import type { GitManageSubmoduleContext, GitManageSubmoduleProvider, GitManageSubmoduleProviderRequest } from "./core.js";

export type GitManageSubmodulePracticeProviderName = "anthropic" | "openai" | "deepmind" | "praxis-native";

export type GitManageSubmoduleDependencies = {
  executor?: BaseToolExecutorPort;
  provider?: GitManageSubmoduleProvider;
};

export type GitManageSubmoduleProviderPractice = {
  providerName: GitManageSubmodulePracticeProviderName;
  source: { kind: "cli" | "agent-sdk" | "api-sdk" | "praxis-native"; label: string; path?: string };
  directCliSupport: boolean;
  sideEffectPolicy: "read-only-inspection" | "workspace-mutation" | "remote-network" | "destructive" | "runtime-governed";
  notes: readonly string[];
  createProvider(dependencies: GitManageSubmoduleDependencies): GitManageSubmoduleProvider | undefined;
};

export const gitManageSubmoduleDependencyDeclarations = [
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
    description: "dryRun:false mutations require an affirmative runtime guard before provider dispatch.",
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
    required: false,
    description: "Runtime-owned network egress policy for submodule add/update actions.",
  },
] satisfies readonly BaseToolDependencyDeclaration[];

export function createHostExecutorGitManageSubmoduleProvider(
  executor: BaseToolExecutorPort | undefined,
): GitManageSubmoduleProvider | undefined {
  const runGit = executor?.git?.runGit;
  if (runGit === undefined) {
    return undefined;
  }

  return async (request: GitManageSubmoduleProviderRequest, _context: GitManageSubmoduleContext) => {
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
