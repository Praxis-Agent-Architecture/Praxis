import type { BaseToolExecutorPort } from "../../../../../agentCore_executionEngine/basic_toolLayer/baseTools/baseToolExecutorPort.js";
import type { BaseToolDependencyDeclaration } from "../../../../../agentCore_executionEngine/basic_toolLayer/baseTools/baseToolDefinition.js";
import type { CodeDeleteProvider } from "./core.js";

export type CodeDeletePracticeProviderName = "anthropic" | "openai" | "deepmind" | "praxis-native";

export type CodeDeleteDependencies = {
  executor?: BaseToolExecutorPort;
  provider?: CodeDeleteProvider;
};

export type CodeDeleteProviderPractice = {
  providerName: CodeDeletePracticeProviderName;
  source: {
    kind: "cli" | "agent-sdk" | "api-sdk" | "praxis-native";
    label: string;
    path?: string;
  };
  directCliSupport: boolean;
  sideEffectPolicy: "runtime-governed";
  notes: readonly string[];
  createProvider(dependencies: CodeDeleteDependencies): CodeDeleteProvider | undefined;
};

export const codeDeleteDependencyDeclarations: readonly BaseToolDependencyDeclaration[] = [
  {
    dependencyId: "runtime.execEngine.filesystem.deletePath",
    kind: "filesystem",
    required: true,
    description: "Runtime-owned path deletion for file and directory delete kinds.",
  },
  {
    dependencyId: "runtime.execEngine.filesystem.readText/writeText",
    kind: "filesystem",
    required: true,
    description: "Runtime-owned text IO for code-range deletion; storage core owns line-range semantics.",
  },
  {
    dependencyId: "runtime.governancePlane.editApproval",
    kind: "permission",
    required: true,
    description: "dryRun:false must carry explicit guard/governance approval before any delete/write.",
  },
];

export function createHostExecutorCodeDeleteProvider(executor: BaseToolExecutorPort | undefined): CodeDeleteProvider | undefined {
  const readText = executor?.filesystem?.readText;
  const writeText = executor?.filesystem?.writeText;
  const deletePath = executor?.filesystem?.deletePath;
  if (deletePath === undefined && (readText === undefined || writeText === undefined)) {
    return undefined;
  }
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
      if (writeText === undefined) {
        throw new Error("runtime filesystem.writeText is unavailable");
      }
      const result = await writeText({ path: request.targetPath, content: request.content, encoding: request.encoding });
      if (!result.ok) {
        throw new Error(result.error.message);
      }
      return { bytesWritten: result.output.bytesWritten };
    },
    async deletePath(request) {
      if (deletePath === undefined) {
        throw new Error("runtime filesystem.deletePath is unavailable");
      }
      const result = await deletePath({ path: request.targetPath, recursive: request.recursive });
      if (!result.ok) {
        throw new Error(result.error.message);
      }
      return { deleted: result.output.deleted };
    },
  };
}
