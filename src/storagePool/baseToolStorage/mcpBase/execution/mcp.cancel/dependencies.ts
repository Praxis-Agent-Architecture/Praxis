import type { BaseToolDependencyDeclaration } from "../../../../../agentCore_executionEngine/basic_toolLayer/baseTools/baseToolDefinition.js";
import type { BaseToolExecutorPort } from "../../../../../agentCore_executionEngine/basic_toolLayer/baseTools/baseToolExecutorPort.js";
import type { McpCancelProvider } from "./core.js";

export type McpCancelPracticeProviderName = "anthropic" | "openai" | "deepmind" | "praxis-native";

export type McpCancelDependencies = {
  executor?: BaseToolExecutorPort;
  provider?: McpCancelProvider;
};

export type McpCancelProviderPractice = {
  providerName: McpCancelPracticeProviderName;
  source: { kind: "cli" | "agent-sdk" | "api-sdk" | "praxis-native"; label: string; path?: string };
  directCliSupport: boolean;
  sideEffectPolicy: "runtime-owned-client";
  notes: readonly string[];
  createProvider(dependencies: McpCancelDependencies): McpCancelProvider | undefined;
};

export const mcpCancelDependencyDeclarations: readonly BaseToolDependencyDeclaration[] = [
  {
    dependencyId: "runtime.execEngine.mcp.cancelExecution",
    kind: "service",
    required: true,
    description: "Runtime-owned MCP cancellation support. BaseTool passes a normalized cancel request and never stores live handles.",
  },
  {
    dependencyId: "runtime.governancePlane.mcpApproval",
    kind: "permission",
    required: true,
    description: "dryRun:false requires explicit guard/governance approval before asking runtime to cancel.",
  },
  {
    dependencyId: "runtime.mcp.executionLifecycle",
    kind: "runtime",
    required: true,
    description: "Execution ids, cancellation handles, progress state, transports, and cleanup remain with runtime.",
  },
];

export function createHostExecutorMcpCancelProvider(executor: BaseToolExecutorPort | undefined): McpCancelProvider | undefined {
  const cancelExecution = executor?.mcp?.cancelExecution;
  if (cancelExecution === undefined) return undefined;
  return async (request, context) => {
    const result = await cancelExecution({ ...request, context });
    if (!result.ok) throw new Error(result.error.message);
    return result.output;
  };
}
