import type { BaseToolDependencyDeclaration } from "../../../../../agentCore_executionEngine/basic_toolLayer/baseTools/baseToolDefinition.js";
import type { BaseToolExecutorPort } from "../../../../../agentCore_executionEngine/basic_toolLayer/baseTools/baseToolExecutorPort.js";
import type { McpNativeExecuteProvider } from "./core.js";

export type McpNativeExecutePracticeProviderName = "anthropic" | "openai" | "deepmind" | "praxis-native";

export type McpNativeExecuteDependencies = {
  executor?: BaseToolExecutorPort;
  provider?: McpNativeExecuteProvider;
};

export type McpNativeExecuteProviderPractice = {
  providerName: McpNativeExecutePracticeProviderName;
  source: {
    kind: "cli" | "agent-sdk" | "api-sdk" | "praxis-native";
    label: string;
    path?: string;
  };
  directCliSupport: boolean;
  sideEffectPolicy: "runtime-owned-client" | "runtime-governed" | "preview-only";
  notes: readonly string[];
  createProvider(dependencies: McpNativeExecuteDependencies): McpNativeExecuteProvider | undefined;
};

export const mcpNativeExecuteDependencyDeclarations: readonly BaseToolDependencyDeclaration[] = [
  {
    dependencyId: "runtime.execEngine.mcp.nativeExecute",
    kind: "service",
    required: true,
    description: "Runtime-owned raw MCP dispatch. BaseTool normalizes the native request and never creates a hidden MCP client.",
  },
  {
    dependencyId: "runtime.governancePlane.mcpRawApproval",
    kind: "permission",
    required: true,
    description: "dryRun:false requires explicit guard approval because raw MCP methods can bypass fixed tool semantics.",
  },
  {
    dependencyId: "runtime.mcp.sessionTransport",
    kind: "runtime",
    required: true,
    description: "Connection, session, transport, OAuth, progress, cancellation, and raw protocol state remain owned by runtime.",
  },
];

export function createHostExecutorMcpNativeExecuteProvider(executor: BaseToolExecutorPort | undefined): McpNativeExecuteProvider | undefined {
  const nativeExecute = executor?.mcp?.nativeExecute;
  if (nativeExecute === undefined) return undefined;
  return async (request, context) => {
    const result = await nativeExecute({ ...request, context });
    if (!result.ok) throw new Error(result.error.message);
    return result.output;
  };
}
