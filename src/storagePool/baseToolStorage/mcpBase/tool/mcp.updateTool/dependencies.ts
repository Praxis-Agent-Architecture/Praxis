import type { BaseToolDependencyDeclaration } from "../../../../../agentCore/agent_executionEngine/basic_toolLayer/baseTools/baseToolDefinition.js";
import type { BaseToolExecutorPort } from "../../../../../agentCore/agent_executionEngine/basic_toolLayer/baseTools/baseToolExecutorPort.js";
import type { UpdateMcpToolProvider } from "./core.js";

export type McpUpdateToolPracticeProviderName = "anthropic" | "openai" | "deepmind" | "praxis-native";
export type McpUpdateToolDependencies = { executor?: BaseToolExecutorPort; provider?: UpdateMcpToolProvider };
export type McpUpdateToolProviderPractice = {
  providerName: McpUpdateToolPracticeProviderName;
  source: { kind: "cli" | "agent-sdk" | "api-sdk" | "praxis-native"; label: string; path?: string };
  directCliSupport: boolean;
  sideEffectPolicy: "runtime-owned-client";
  notes: readonly string[];
  createProvider(dependencies: McpUpdateToolDependencies): UpdateMcpToolProvider | undefined;
};

export const mcpUpdateToolDependencyDeclarations: readonly BaseToolDependencyDeclaration[] = [
  { dependencyId: "runtime.execEngine.mcp.updateTool", kind: "service", required: true, description: "Runtime-owned MCP tool update support. BaseTool shapes the patch and does not own registry state." },
  { dependencyId: "runtime.governancePlane.mcpApproval", kind: "permission", required: true, description: "dryRun:false requires explicit guard approval before updating runtime MCP registry state." },
];

export function createHostExecutorMcpUpdateToolProvider(executor: BaseToolExecutorPort | undefined): UpdateMcpToolProvider | undefined {
  const updateTool = executor?.mcp?.updateTool;
  if (updateTool === undefined) return undefined;
  return async (request, context) => {
    const result = await updateTool({ ...request, context });
    if (!result.ok) throw new Error(result.error.message);
    return result.output;
  };
}
