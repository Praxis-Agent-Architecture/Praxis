import type { BaseToolDependencyDeclaration } from "../../../../../agentCore_executionEngine/basic_toolLayer/baseTools/baseToolDefinition.js";
import type { BaseToolExecutorPort } from "../../../../../agentCore_executionEngine/basic_toolLayer/baseTools/baseToolExecutorPort.js";
import type { CodeReadProvider } from "./core.js";

export type CodeReadPracticeProviderName = "anthropic" | "openai" | "deepmind" | "praxis-native";

export type CodeReadDependencies = {
  executor?: BaseToolExecutorPort;
  provider?: CodeReadProvider;
};

export type CodeReadProviderPractice = {
  providerName: CodeReadPracticeProviderName;
  source: {
    kind: "cli" | "agent-sdk" | "api-sdk" | "praxis-native";
    label: string;
    path?: string;
  };
  directCliSupport: boolean;
  sideEffectPolicy: "read-only";
  notes: readonly string[];
  createProvider(dependencies: CodeReadDependencies): CodeReadProvider | undefined;
};

export const codeReadDependencyDeclarations = [
  {
    dependencyId: "runtime.execEngine.filesystem.readText",
    kind: "filesystem",
    required: true,
    description: "Runtime-provided text reader exposed through BaseToolExecutorPort.filesystem.readText",
  },
  {
    dependencyId: "runtime.governancePlane.workspaceReadScope",
    kind: "permission",
    required: true,
    description: "Runtime workspaceRoot, allowedRoots, and scope decision carried in code.read context",
  },
  {
    dependencyId: "runtime.capabilityExposure.codeReadEnvelope",
    kind: "runtime",
    required: true,
    description: "Runtime-safe code read result envelope for content, encoding, byte count, and truncation metadata",
  },
] satisfies readonly BaseToolDependencyDeclaration[];

export function createHostExecutorCodeReadProvider(executor: BaseToolExecutorPort | undefined): CodeReadProvider | undefined {
  const readText = executor?.filesystem?.readText;
  if (readText === undefined) {
    return undefined;
  }

  return async (request) => {
    const result = await readText({
      path: request.targetPath,
      encoding: request.encoding,
      maxBytes: request.maxBytes,
    });

    if (!result.ok) {
      throw new Error(result.error.message);
    }

    return {
      content: result.output.content,
      encoding: request.encoding,
      truncated: result.output.truncated,
    };
  };
}
