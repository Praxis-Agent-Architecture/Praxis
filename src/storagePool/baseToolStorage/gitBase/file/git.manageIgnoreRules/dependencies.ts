import type { BaseToolExecutorPort } from "../../../../../agentCore_executionEngine/basic_toolLayer/baseTools/baseToolExecutorPort.js";
import type { BaseToolDependencyDeclaration } from "../../../../../agentCore_executionEngine/basic_toolLayer/baseTools/baseToolDefinition.js";
import type { GitManageIgnoreRulesProvider } from "./core.js";

export type GitManageIgnoreRulesPracticeProviderName = "anthropic" | "openai" | "deepmind" | "praxis-native";

export type GitManageIgnoreRulesDependencies = {
  executor?: BaseToolExecutorPort;
  provider?: GitManageIgnoreRulesProvider;
};

export type GitManageIgnoreRulesProviderPractice = {
  providerName: GitManageIgnoreRulesPracticeProviderName;
  source: {
    kind: "cli" | "agent-sdk" | "api-sdk" | "praxis-native";
    label: string;
    path?: string;
  };
  directCliSupport: boolean;
  sideEffectPolicy: "workspace-mutation" | "read-only-inspection" | "runtime-governed";
  notes: readonly string[];
  createProvider(dependencies: GitManageIgnoreRulesDependencies): GitManageIgnoreRulesProvider | undefined;
};

export const gitManageIgnoreRulesDependencyDeclarations = [
  {
    dependencyId: "runtime.execEngine.filesystem.readText",
    kind: "filesystem",
    required: true,
    description: "Runtime-owned text reader used to inspect the target ignore file.",
  },
  {
    dependencyId: "runtime.execEngine.filesystem.writeText",
    kind: "filesystem",
    required: true,
    description: "Runtime-owned text writer used for add/remove/replace ignore rule mutations.",
  },
  {
    dependencyId: "runtime.governancePlane.toolInvocationGrant",
    kind: "permission",
    required: true,
    description: "dryRun:false requires an affirmative runtime guard before provider dispatch.",
  },
] satisfies readonly BaseToolDependencyDeclaration[];

export function createHostExecutorGitManageIgnoreRulesProvider(
  executor: BaseToolExecutorPort | undefined,
): GitManageIgnoreRulesProvider | undefined {
  const readText = executor?.filesystem?.readText;
  if (readText === undefined) return undefined;
  const writeText = executor?.filesystem?.writeText;
  return {
    async readText(request) {
      const result = await readText({ path: request.path, encoding: "utf8", maxBytes: request.maxBytes });
      if (!result.ok) {
        return { content: "", missing: result.error.code === "FILE_NOT_FOUND" };
      }
      return { content: result.output.content, truncated: result.output.truncated };
    },
    writeText:
      writeText === undefined
        ? undefined
        : async (request) => {
            const result = await writeText({ path: request.path, content: request.content, encoding: "utf8" });
            if (!result.ok) {
              throw new Error(result.error.message);
            }
            return { bytesWritten: result.output.bytesWritten };
          },
  };
}
