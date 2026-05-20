import type { BaseToolExecutorPort } from "../../../../../executionEngine/basic_toolLayer/baseTools/baseToolExecutorPort.js";
import type { BaseToolDependencyDeclaration } from "../../../../../executionEngine/basic_toolLayer/baseTools/baseToolDefinition.js";
import type { McpAuthorizeProvider } from "./core.js";

export type McpAuthorizePracticeProviderName = "anthropic" | "openai" | "deepmind" | "praxis-native";

export type McpAuthorizeDependencies = {
  executor?: BaseToolExecutorPort;
  provider?: McpAuthorizeProvider;
};

export type McpAuthorizeProviderPractice = {
  providerName: McpAuthorizePracticeProviderName;
  source: { kind: "cli" | "agent-sdk" | "api-sdk" | "praxis-native"; label: string; path?: string };
  directCliSupport: boolean;
  sideEffectPolicy: "runtime-owned-client";
  notes: readonly string[];
  createProvider(dependencies: McpAuthorizeDependencies): McpAuthorizeProvider | undefined;
};

export const mcpAuthorizeDependencyDeclarations: readonly BaseToolDependencyDeclaration[] = [
  {
    dependencyId: "runtime.execEngine.mcp.authorize",
    kind: "service",
    required: true,
    description: "Runtime-owned MCP authorization support. BaseTool normalizes policy input and does not own product policy.",
  },
  {
    dependencyId: "runtime.governancePlane.mcpApproval",
    kind: "permission",
    required: true,
    description: "dryRun:false requires explicit guard/governance approval before asking runtime for an authorization decision.",
  },
  {
    dependencyId: "runtime.mcp.policyStore",
    kind: "runtime",
    required: true,
    description: "Subject identity, server grants, and policy decisions remain with runtime/TAP.",
  },
];

export function createHostExecutorMcpAuthorizeProvider(executor: BaseToolExecutorPort | undefined): McpAuthorizeProvider | undefined {
  const authorize = executor?.mcp?.authorize;
  if (authorize === undefined) return undefined;
  return async (request, context) => {
    const result = await authorize({ ...request, context });
    if (!result.ok) throw new Error(result.error.message);
    return result.output;
  };
}
