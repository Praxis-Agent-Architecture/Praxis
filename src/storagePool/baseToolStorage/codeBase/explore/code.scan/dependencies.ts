import type { BaseToolDependencyDeclaration } from "../../../../../agentCore/agent_executionEngine/basic_toolLayer/baseTools/baseToolDefinition.js";
import type { BaseToolExecutorPort } from "../../../../../agentCore/agent_executionEngine/basic_toolLayer/baseTools/baseToolExecutorPort.js";
import type { CodeScanProvider } from "./core.js";

export type CodeScanPracticeProviderName = "anthropic" | "openai" | "deepmind" | "praxis-native";

export type CodeScanDependencies = {
  executor?: BaseToolExecutorPort;
  provider?: CodeScanProvider;
};

export type CodeScanProviderPractice = {
  providerName: CodeScanPracticeProviderName;
  source: {
    kind: "cli" | "agent-sdk" | "api-sdk" | "praxis-native";
    label: string;
    path?: string;
  };
  directCliSupport: boolean;
  sideEffectPolicy: "read-only";
  notes: readonly string[];
  createProvider(dependencies: CodeScanDependencies): CodeScanProvider | undefined;
};

export const codeScanDependencyDeclarations = [
  {
    dependencyId: "runtime.execEngine.filesystem.list",
    kind: "filesystem",
    required: true,
    description: "Runtime-provided directory lister exposed through BaseToolExecutorPort.filesystem.list",
  },
  {
    dependencyId: "runtime.governancePlane.workspaceReadScope",
    kind: "permission",
    required: true,
    description: "Runtime workspaceRoot, allowedRoots, and scope decision carried in code.scan context",
  },
  {
    dependencyId: "runtime.capabilityExposure.codeScanEnvelope",
    kind: "runtime",
    required: true,
    description: "Runtime-safe code scan result envelope for entries, pagination, and truncation metadata",
  },
] satisfies readonly BaseToolDependencyDeclaration[];

export function createHostExecutorCodeScanProvider(executor: BaseToolExecutorPort | undefined): CodeScanProvider | undefined {
  const list = executor?.filesystem?.list;
  if (list === undefined) {
    return undefined;
  }

  return async (request) => {
    const result = await list({
      path: request.directoryPath,
      maxEntries: request.maxEntries,
      depth: request.depth,
      includeGlobs: request.includeGlobs,
      excludeGlobs: request.excludeGlobs,
    });

    if (!result.ok) {
      throw new Error(result.error.message);
    }

    return result.output.entries.map((entry) => ({
      path: entry,
      kind: entry.endsWith("/") ? "directory" : "unknown",
    }));
  };
}
