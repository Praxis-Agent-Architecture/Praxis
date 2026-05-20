import type { BaseToolDependencyDeclaration } from "../../../../../agentCore_executionEngine/basic_toolLayer/baseTools/baseToolDefinition.js";
import type { BaseToolExecutorPort } from "../../../../../agentCore_executionEngine/basic_toolLayer/baseTools/baseToolExecutorPort.js";
import type { ListMcpToolsProvider } from "./core.js";

export type McpListToolsPracticeProviderName = "anthropic" | "openai" | "deepmind" | "praxis-native";

export type McpListToolsDependencies = {
  executor?: BaseToolExecutorPort;
  provider?: ListMcpToolsProvider;
};

export type McpListToolsProviderPractice = {
  providerName: McpListToolsPracticeProviderName;
  source: { kind: "cli" | "agent-sdk" | "api-sdk" | "praxis-native"; label: string; path?: string };
  directCliSupport: boolean;
  sideEffectPolicy: "runtime-owned-client";
  notes: readonly string[];
  createProvider(dependencies: McpListToolsDependencies): ListMcpToolsProvider | undefined;
};

export const mcpListToolsDependencyDeclarations: readonly BaseToolDependencyDeclaration[] = [
  {
    dependencyId: "runtime.execEngine.mcp.listTools",
    kind: "service",
    required: true,
    description: "Runtime-owned MCP tools/list support; baseTool owns validation and result normalization.",
  },
  {
    dependencyId: "runtime.governancePlane.mcpApproval",
    kind: "permission",
    required: true,
    description: "dryRun:false requires explicit guard approval before querying the runtime MCP client.",
  },
];

export function createHostExecutorMcpListToolsProvider(executor: BaseToolExecutorPort | undefined): ListMcpToolsProvider | undefined {
  const listTools = executor?.mcp?.listTools;
  if (listTools === undefined) return undefined;
  return async (request, context) => {
    const result = await listTools({ ...request, context });
    if (!result.ok) throw new Error(result.error.message);
    return result.output;
  };
}
