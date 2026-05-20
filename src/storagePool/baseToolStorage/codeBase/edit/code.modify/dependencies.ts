import type { BaseToolExecutorPort } from "../../../../../executionEngine/basic_toolLayer/baseTools/baseToolExecutorPort.js";
import type { BaseToolDependencyDeclaration } from "../../../../../executionEngine/basic_toolLayer/baseTools/baseToolDefinition.js";
import type { CodeModifyProvider } from "./core.js";

export type CodeModifyPracticeProviderName = "anthropic" | "openai" | "deepmind" | "praxis-native";

export type CodeModifyDependencies = {
  executor?: BaseToolExecutorPort;
  provider?: CodeModifyProvider;
};

export type CodeModifyProviderPractice = {
  providerName: CodeModifyPracticeProviderName;
  source: {
    kind: "cli" | "agent-sdk" | "api-sdk" | "praxis-native";
    label: string;
    path?: string;
  };
  directCliSupport: boolean;
  sideEffectPolicy: "runtime-governed";
  notes: readonly string[];
  createProvider(dependencies: CodeModifyDependencies): CodeModifyProvider | undefined;
};

export const codeModifyDependencyDeclarations: readonly BaseToolDependencyDeclaration[] = [
  {
    dependencyId: "runtime.execEngine.filesystem.readText",
    kind: "filesystem",
    required: true,
    description: "Runtime-owned raw text reader; storage core owns bounded replacement semantics.",
  },
  {
    dependencyId: "runtime.execEngine.filesystem.writeText",
    kind: "filesystem",
    required: true,
    description: "Runtime-owned text writer for final modified content.",
  },
  {
    dependencyId: "runtime.governancePlane.editApproval",
    kind: "permission",
    required: true,
    description: "dryRun:false must carry explicit guard/governance approval before any write.",
  },
];

export function createHostExecutorCodeModifyProvider(executor: BaseToolExecutorPort | undefined): CodeModifyProvider | undefined {
  const readText = executor?.filesystem?.readText;
  const writeText = executor?.filesystem?.writeText;
  if (readText === undefined || writeText === undefined) {
    return undefined;
  }
  return {
    async readText(request) {
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
