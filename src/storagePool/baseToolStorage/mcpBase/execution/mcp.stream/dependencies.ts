import type { BaseToolDependencyDeclaration } from "../../../../../agentCore_executionEngine/basic_toolLayer/baseTools/baseToolDefinition.js";
import type { BaseToolExecutorPort } from "../../../../../agentCore_executionEngine/basic_toolLayer/baseTools/baseToolExecutorPort.js";
import type { McpStreamProvider } from "./core.js";

export type McpStreamPracticeProviderName = "anthropic" | "openai" | "deepmind" | "praxis-native";

export type McpStreamDependencies = {
  executor?: BaseToolExecutorPort;
  provider?: McpStreamProvider;
};

export type McpStreamProviderPractice = {
  providerName: McpStreamPracticeProviderName;
  source: { kind: "cli" | "agent-sdk" | "api-sdk" | "praxis-native"; label: string; path?: string };
  directCliSupport: boolean;
  sideEffectPolicy: "runtime-owned-client";
  notes: readonly string[];
  createProvider(dependencies: McpStreamDependencies): McpStreamProvider | undefined;
};

export const mcpStreamDependencyDeclarations: readonly BaseToolDependencyDeclaration[] = [
  {
    dependencyId: "runtime.execEngine.mcp.streamTool",
    kind: "service",
    required: true,
    description: "Runtime-owned MCP streaming support. BaseTool passes a normalized stream request and never owns stream handles or buffers.",
  },
  {
    dependencyId: "runtime.governancePlane.mcpApproval",
    kind: "permission",
    required: true,
    description: "dryRun:false requires explicit guard/governance approval before asking runtime to stream.",
  },
  {
    dependencyId: "runtime.mcp.streamLifecycle",
    kind: "runtime",
    required: true,
    description: "Stream ids, progress, backpressure, cancellation handles, transports, and cleanup remain with runtime.",
  },
];

export function createHostExecutorMcpStreamProvider(executor: BaseToolExecutorPort | undefined): McpStreamProvider | undefined {
  const streamTool = executor?.mcp?.streamTool;
  if (streamTool === undefined) return undefined;
  return async (request, context) => {
    const result = await streamTool({ ...request, context });
    if (!result.ok) throw new Error(result.error.message);
    return result.output;
  };
}
