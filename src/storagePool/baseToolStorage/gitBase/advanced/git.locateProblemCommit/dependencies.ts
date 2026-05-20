import type { BaseToolExecutorPort } from "../../../../../agentCore_executionEngine/basic_toolLayer/baseTools/baseToolExecutorPort.js";
import type { BaseToolDependencyDeclaration } from "../../../../../agentCore_executionEngine/basic_toolLayer/baseTools/baseToolDefinition.js";
import type {
  GitLocateProblemCommitContext,
  GitLocateProblemCommitProvider,
  GitLocateProblemCommitProviderRequest,
} from "./core.js";

export type GitLocateProblemCommitPracticeProviderName = "anthropic" | "openai" | "deepmind" | "praxis-native";

export type GitLocateProblemCommitDependencies = {
  executor?: BaseToolExecutorPort;
  provider?: GitLocateProblemCommitProvider;
};

export type GitLocateProblemCommitProviderPractice = {
  providerName: GitLocateProblemCommitPracticeProviderName;
  source: { kind: "cli" | "agent-sdk" | "api-sdk" | "praxis-native"; label: string; path?: string };
  directCliSupport: boolean;
  sideEffectPolicy: "read-only-inspection" | "runtime-governed";
  notes: readonly string[];
  createProvider(dependencies: GitLocateProblemCommitDependencies): GitLocateProblemCommitProvider | undefined;
};

export const gitLocateProblemCommitDependencyDeclarations = [
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
    description: "dryRun:false read execution requires an affirmative runtime guard before provider dispatch.",
  },
  {
    dependencyId: "git",
    kind: "binary",
    required: true,
    description: "Host git binary used by the runtime-owned git executor.",
  },
] satisfies readonly BaseToolDependencyDeclaration[];

export function createHostExecutorGitLocateProblemCommitProvider(
  executor: BaseToolExecutorPort | undefined,
): GitLocateProblemCommitProvider | undefined {
  const runGit = executor?.git?.runGit;
  if (runGit === undefined) {
    return undefined;
  }

  return async (request: GitLocateProblemCommitProviderRequest, _context: GitLocateProblemCommitContext) => {
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
