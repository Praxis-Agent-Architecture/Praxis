import type { BaseToolDependencyDeclaration } from "../../../../../executionEngine/basic_toolLayer/baseTools/baseToolDefinition.js";
import type { BaseToolExecutorPort } from "../../../../../executionEngine/basic_toolLayer/baseTools/baseToolExecutorPort.js";
import type { CodeSearchRipgrepExecutor } from "./core.js";

export type CodeSearchRipgrepPracticeProviderName = "anthropic" | "openai" | "deepmind" | "praxis-native";

export type CodeSearchRipgrepDependencies = {
  executor?: BaseToolExecutorPort;
  provider?: CodeSearchRipgrepExecutor;
};

export type CodeSearchRipgrepProviderPractice = {
  providerName: CodeSearchRipgrepPracticeProviderName;
  source: {
    kind: "cli" | "agent-sdk" | "api-sdk" | "praxis-native";
    label: string;
    path?: string;
  };
  directCliSupport: boolean;
  sideEffectPolicy: "read-only";
  notes: readonly string[];
  createProvider(dependencies: CodeSearchRipgrepDependencies): CodeSearchRipgrepExecutor | undefined;
};

export const codeSearchRipgrepDependencyDeclarations = [
  {
    dependencyId: "runtime.execEngine.search.ripgrep",
    kind: "runtime",
    required: true,
    description: "Runtime-provided ripgrep-style search exposed through BaseToolExecutorPort.search.ripgrep",
  },
  {
    dependencyId: "runtime.binary.rg",
    kind: "binary",
    required: true,
    description: "ripgrep-compatible search provider for fast code text search",
  },
  {
    dependencyId: "runtime.governancePlane.workspaceReadScope",
    kind: "permission",
    required: true,
    description: "Runtime workspaceRoot, allowedRoots, and scope decision carried in code.search_Ripgrep context",
  },
] satisfies readonly BaseToolDependencyDeclaration[];

export function createHostExecutorCodeSearchRipgrepProvider(
  executor: BaseToolExecutorPort | undefined,
): CodeSearchRipgrepExecutor | undefined {
  const ripgrep = executor?.search?.ripgrep;
  if (ripgrep === undefined) {
    return undefined;
  }

  return async (request) => {
    const result = await ripgrep({
      command: request.command,
      query: request.query,
      directoryPath: request.directoryPath,
      fileGlob: request.fileGlob,
      maxMatches: request.maxMatches,
      literal: request.literal,
      caseSensitive: request.caseSensitive,
      includeHidden: request.includeHidden,
      multiline: request.multiline,
      contextLines: request.contextLines,
      context: request.context,
    });

    if (!result.ok) {
      throw new Error(result.error.message);
    }

    return result.output;
  };
}
