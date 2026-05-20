import type { BaseToolDependencyDeclaration } from "../../../../../agentCore_executionEngine/basic_toolLayer/baseTools/baseToolDefinition.js";
import type { BaseToolExecutorPort } from "../../../../../agentCore_executionEngine/basic_toolLayer/baseTools/baseToolExecutorPort.js";
import type { McpSubscribeProvider } from "./core.js";

export type McpSubscribePracticeProviderName = "anthropic" | "openai" | "deepmind" | "praxis-native";

export type McpSubscribeDependencies = {
  executor?: BaseToolExecutorPort;
  provider?: McpSubscribeProvider;
};

export type McpSubscribeProviderPractice = {
  providerName: McpSubscribePracticeProviderName;
  source: { kind: "cli" | "agent-sdk" | "api-sdk" | "praxis-native"; label: string; path?: string };
  directCliSupport: boolean;
  sideEffectPolicy: "runtime-owned-client";
  notes: readonly string[];
  createProvider(dependencies: McpSubscribeDependencies): McpSubscribeProvider | undefined;
};

export const mcpSubscribeDependencyDeclarations: readonly BaseToolDependencyDeclaration[] = [
  {
    dependencyId: "runtime.execEngine.mcp.subscribe",
    kind: "service",
    required: true,
    description: "Runtime-owned MCP subscription support. BaseTool passes a normalized subscribe request and never owns event streams.",
  },
  {
    dependencyId: "runtime.governancePlane.mcpApproval",
    kind: "permission",
    required: true,
    description: "dryRun:false requires explicit guard/governance approval before asking runtime to subscribe.",
  },
  {
    dependencyId: "runtime.mcp.subscriptionLifecycle",
    kind: "runtime",
    required: true,
    description: "Subscription ids, notification handlers, reconnect, delivery buffers, and cleanup remain with runtime.",
  },
];

export function createHostExecutorMcpSubscribeProvider(executor: BaseToolExecutorPort | undefined): McpSubscribeProvider | undefined {
  const subscribe = executor?.mcp?.subscribe;
  if (subscribe === undefined) return undefined;
  return async (request, context) => {
    const result = await subscribe({ ...request, context });
    if (!result.ok) throw new Error(result.error.message);
    return result.output;
  };
}
