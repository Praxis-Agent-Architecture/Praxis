import type { BaseToolDependencyDeclaration } from "../../../../../executionEngine/basic_toolLayer/baseTools/baseToolDefinition.js";
import type { BaseToolExecutorPort } from "../../../../../executionEngine/basic_toolLayer/baseTools/baseToolExecutorPort.js";
import type { McpUnsubscribeProvider } from "./core.js";

export type McpUnsubscribePracticeProviderName = "anthropic" | "openai" | "deepmind" | "praxis-native";

export type McpUnsubscribeDependencies = {
  executor?: BaseToolExecutorPort;
  provider?: McpUnsubscribeProvider;
};

export type McpUnsubscribeProviderPractice = {
  providerName: McpUnsubscribePracticeProviderName;
  source: { kind: "cli" | "agent-sdk" | "api-sdk" | "praxis-native"; label: string; path?: string };
  directCliSupport: boolean;
  sideEffectPolicy: "runtime-owned-client";
  notes: readonly string[];
  createProvider(dependencies: McpUnsubscribeDependencies): McpUnsubscribeProvider | undefined;
};

export const mcpUnsubscribeDependencyDeclarations: readonly BaseToolDependencyDeclaration[] = [
  {
    dependencyId: "runtime.execEngine.mcp.unsubscribe",
    kind: "service",
    required: true,
    description: "Runtime-owned MCP unsubscribe support. BaseTool passes a normalized unsubscribe request and never owns event stream cleanup.",
  },
  {
    dependencyId: "runtime.governancePlane.mcpApproval",
    kind: "permission",
    required: true,
    description: "dryRun:false requires explicit guard/governance approval before asking runtime to unsubscribe.",
  },
  {
    dependencyId: "runtime.mcp.subscriptionLifecycle",
    kind: "runtime",
    required: true,
    description: "Subscription handles, listener removal, notification buffers, and cleanup remain with runtime.",
  },
];

export function createHostExecutorMcpUnsubscribeProvider(executor: BaseToolExecutorPort | undefined): McpUnsubscribeProvider | undefined {
  const unsubscribe = executor?.mcp?.unsubscribe;
  if (unsubscribe === undefined) return undefined;
  return async (request, context) => {
    const result = await unsubscribe({ ...request, context });
    if (!result.ok) throw new Error(result.error.message);
    return result.output;
  };
}
