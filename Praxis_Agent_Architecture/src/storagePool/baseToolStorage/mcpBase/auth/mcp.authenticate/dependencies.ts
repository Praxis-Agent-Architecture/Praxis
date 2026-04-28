import type { BaseToolExecutorPort } from "../../../../../agentCore/agent_executionEngine/basic_toolLayer/baseTools/baseToolExecutorPort.js";
import type { BaseToolDependencyDeclaration } from "../../../../../agentCore/agent_executionEngine/basic_toolLayer/baseTools/baseToolDefinition.js";
import type { McpAuthenticateProvider } from "./core.js";

export type McpAuthenticatePracticeProviderName = "anthropic" | "openai" | "deepmind" | "praxis-native";

export type McpAuthenticateDependencies = {
  executor?: BaseToolExecutorPort;
  provider?: McpAuthenticateProvider;
};

export type McpAuthenticateProviderPractice = {
  providerName: McpAuthenticatePracticeProviderName;
  source: { kind: "cli" | "agent-sdk" | "api-sdk" | "praxis-native"; label: string; path?: string };
  directCliSupport: boolean;
  sideEffectPolicy: "runtime-owned-client";
  notes: readonly string[];
  createProvider(dependencies: McpAuthenticateDependencies): McpAuthenticateProvider | undefined;
};

export const mcpAuthenticateDependencyDeclarations: readonly BaseToolDependencyDeclaration[] = [
  {
    dependencyId: "runtime.execEngine.mcp.authenticate",
    kind: "service",
    required: true,
    description: "Runtime-owned MCP authentication support. BaseTool passes credentialRef and never handles raw credential material.",
  },
  {
    dependencyId: "runtime.governancePlane.mcpApproval",
    kind: "permission",
    required: true,
    description: "dryRun:false requires explicit guard/governance approval before asking runtime to authenticate.",
  },
  {
    dependencyId: "runtime.mcp.authStore",
    kind: "runtime",
    required: true,
    description: "OAuth/token/session material and refresh lifecycle remain with runtime.",
  },
];

export function createHostExecutorMcpAuthenticateProvider(executor: BaseToolExecutorPort | undefined): McpAuthenticateProvider | undefined {
  const authenticate = executor?.mcp?.authenticate;
  if (authenticate === undefined) return undefined;
  return async (request, context) => {
    const result = await authenticate({ ...request, context });
    if (!result.ok) throw new Error(result.error.message);
    return result.output;
  };
}
