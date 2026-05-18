import type { BaseToolDependencyDeclaration } from "../../../../../agentCore/agent_executionEngine/basic_toolLayer/baseTools/baseToolDefinition.js";
import type { BaseToolExecutorPort } from "../../../../../agentCore/agent_executionEngine/basic_toolLayer/baseTools/baseToolExecutorPort.js";
import type { RegisterMcpToolProvider } from "./core.js";

export type McpRegisterToolPracticeProviderName = "anthropic" | "openai" | "deepmind" | "praxis-native";
export type McpRegisterToolDependencies = { executor?: BaseToolExecutorPort; provider?: RegisterMcpToolProvider };
export type McpRegisterToolProviderPractice = {
  providerName: McpRegisterToolPracticeProviderName;
  source: { kind: "cli" | "agent-sdk" | "api-sdk" | "praxis-native"; label: string; path?: string };
  directCliSupport: boolean;
  sideEffectPolicy: "runtime-owned-client";
  notes: readonly string[];
  createProvider(dependencies: McpRegisterToolDependencies): RegisterMcpToolProvider | undefined;
};

export const mcpRegisterToolDependencyDeclarations: readonly BaseToolDependencyDeclaration[] = [
  {
    dependencyId: "runtime.execEngine.mcp.registerTool",
    kind: "service",
    required: true,
    description: "Runtime-owned MCP tool registration support. BaseTool validates and shapes the registration request only.",
  },
  {
    dependencyId: "runtime.governancePlane.mcpApproval",
    kind: "permission",
    required: true,
    description: "dryRun:false requires explicit guard approval before mutating runtime MCP tool registry state.",
  },
];

export function createHostExecutorMcpRegisterToolProvider(executor: BaseToolExecutorPort | undefined): RegisterMcpToolProvider | undefined {
  const registerTool = executor?.mcp?.registerTool;
  if (registerTool === undefined) return undefined;
  return async (request, context) => {
    const result = await registerTool({ ...request, context });
    if (!result.ok) throw new Error(result.error.message);
    return result.output;
  };
}
