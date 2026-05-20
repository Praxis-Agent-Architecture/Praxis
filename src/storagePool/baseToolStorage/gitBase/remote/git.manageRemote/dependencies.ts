import type { BaseToolExecutorPort } from "../../../../../agentCore_executionEngine/basic_toolLayer/baseTools/baseToolExecutorPort.js";
import type { BaseToolDependencyDeclaration } from "../../../../../agentCore_executionEngine/basic_toolLayer/baseTools/baseToolDefinition.js";
import type { GitManageRemoteContext, GitManageRemoteProvider, GitManageRemoteProviderRequest } from "./core.js";

export type GitManageRemotePracticeProviderName = "anthropic" | "openai" | "deepmind" | "praxis-native";

export type GitManageRemoteDependencies = {
  executor?: BaseToolExecutorPort;
  provider?: GitManageRemoteProvider;
};

export type GitManageRemoteProviderPractice = {
  providerName: GitManageRemotePracticeProviderName;
  source: { kind: "cli" | "agent-sdk" | "api-sdk" | "praxis-native"; label: string; path?: string };
  directCliSupport: boolean;
  sideEffectPolicy: "read-only-inspection" | "workspace-mutation" | "runtime-governed";
  notes: readonly string[];
  createProvider(dependencies: GitManageRemoteDependencies): GitManageRemoteProvider | undefined;
};

export const gitManageRemoteDependencyDeclarations = [
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
] satisfies readonly BaseToolDependencyDeclaration[];

export function createHostExecutorGitManageRemoteProvider(
  executor: BaseToolExecutorPort | undefined,
): GitManageRemoteProvider | undefined {
  const runGit = executor?.git?.runGit;
  if (runGit === undefined) {
    return undefined;
  }

  return async (request: GitManageRemoteProviderRequest, _context: GitManageRemoteContext) => {
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
