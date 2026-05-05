import type { BaseToolExecutorPort } from "../../../../../agentCore/agent_executionEngine/basic_toolLayer/baseTools/baseToolExecutorPort.js";
import type { BaseToolDependencyDeclaration } from "../../../../../agentCore/agent_executionEngine/basic_toolLayer/baseTools/baseToolDefinition.js";
import type { CodeOverwriteProvider } from "./core.js";

export type CodeOverwritePracticeProviderName = "anthropic" | "openai" | "deepmind" | "praxis-native";

export type CodeOverwriteDependencies = {
  executor?: BaseToolExecutorPort;
  provider?: CodeOverwriteProvider;
};

export type CodeOverwriteProviderPractice = {
  providerName: CodeOverwritePracticeProviderName;
  source: {
    kind: "cli" | "agent-sdk" | "api-sdk" | "praxis-native";
    label: string;
    path?: string;
  };
  directCliSupport: boolean;
  sideEffectPolicy: "runtime-governed";
  notes: readonly string[];
  createProvider(dependencies: CodeOverwriteDependencies): CodeOverwriteProvider | undefined;
};

export const codeOverwriteDependencyDeclarations: readonly BaseToolDependencyDeclaration[] = [
  {
    dependencyId: "runtime.execEngine.filesystem.readText",
    kind: "filesystem",
    required: false,
    description: "Runtime-owned text reader used only for expectedExistingHash verification.",
  },
  {
    dependencyId: "runtime.execEngine.filesystem.writeText",
    kind: "filesystem",
    required: true,
    description: "Runtime-owned text writer for guarded overwrite execution.",
  },
  {
    dependencyId: "runtime.governancePlane.editApproval",
    kind: "permission",
    required: true,
    description: "dryRun:false must carry explicit guard/governance approval before any write.",
  },
];

export function createHostExecutorCodeOverwriteProvider(
  executor: BaseToolExecutorPort | undefined,
): CodeOverwriteProvider | undefined {
  const writeText = executor?.filesystem?.writeText;
  if (writeText === undefined) {
    return undefined;
  }
  const readText = executor?.filesystem?.readText;
  return {
    async readText(request) {
      if (readText === undefined) {
        throw new Error("runtime filesystem.readText is unavailable");
      }
      const result = await readText({ path: request.targetPath, encoding: request.encoding, maxBytes: request.maxBytes });
      if (!result.ok) {
        throw new Error(result.error.message);
      }
      return { content: result.output.content, truncated: result.output.truncated, encoding: request.encoding };
    },
    async writeText(request) {
      const result = await writeText({ path: request.targetPath, content: request.content, encoding: request.encoding });
      if (!result.ok) {
        throw new Error(result.error.message);
      }
      return { bytesWritten: result.output.bytesWritten };
    },
  };
}
