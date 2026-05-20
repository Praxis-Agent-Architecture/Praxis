import type { BaseToolExecutorPort } from "../../../../../agentCore_executionEngine/basic_toolLayer/baseTools/baseToolExecutorPort.js";
import type { BaseToolDependencyDeclaration } from "../../../../../agentCore_executionEngine/basic_toolLayer/baseTools/baseToolDefinition.js";
import type { CodeReplaceFileProvider } from "./core.js";

export type CodeReplaceFilePracticeProviderName = "anthropic" | "openai" | "deepmind" | "praxis-native";

export type CodeReplaceFileDependencies = {
  executor?: BaseToolExecutorPort;
  provider?: CodeReplaceFileProvider;
};

export type CodeReplaceFileProviderPractice = {
  providerName: CodeReplaceFilePracticeProviderName;
  source: {
    kind: "cli" | "agent-sdk" | "api-sdk" | "praxis-native";
    label: string;
    path?: string;
  };
  directCliSupport: boolean;
  sideEffectPolicy: "runtime-governed";
  notes: readonly string[];
  createProvider(dependencies: CodeReplaceFileDependencies): CodeReplaceFileProvider | undefined;
};

export const codeReplaceFileDependencyDeclarations: readonly BaseToolDependencyDeclaration[] = [
  {
    dependencyId: "runtime.execEngine.filesystem.readText",
    kind: "filesystem",
    required: false,
    description: "Runtime-owned text reader used only for expectedCurrentHash verification.",
  },
  {
    dependencyId: "runtime.execEngine.filesystem.writeText",
    kind: "filesystem",
    required: true,
    description: "Runtime-owned text writer for guarded whole-file replacement.",
  },
  {
    dependencyId: "runtime.governancePlane.editApproval",
    kind: "permission",
    required: true,
    description: "dryRun:false must carry explicit guard/governance approval before any write.",
  },
];

export function createHostExecutorCodeReplaceFileProvider(
  executor: BaseToolExecutorPort | undefined,
): CodeReplaceFileProvider | undefined {
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
