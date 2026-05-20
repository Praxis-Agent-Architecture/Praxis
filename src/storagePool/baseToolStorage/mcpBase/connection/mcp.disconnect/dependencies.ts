import type { BaseToolDependencyDeclaration } from "../../../../../agentCore_executionEngine/basic_toolLayer/baseTools/baseToolDefinition.js";
import type { BaseToolExecutorPort } from "../../../../../agentCore_executionEngine/basic_toolLayer/baseTools/baseToolExecutorPort.js";
import type { McpDisconnectProvider } from "./core.js";

export type McpDisconnectPracticeProviderName = "anthropic" | "openai" | "deepmind" | "praxis-native";
export type McpDisconnectDependencies = { executor?: BaseToolExecutorPort; provider?: McpDisconnectProvider };
export type McpDisconnectProviderPractice = { providerName: McpDisconnectPracticeProviderName; source: { kind: "cli" | "agent-sdk" | "api-sdk" | "praxis-native"; label: string; path?: string }; directCliSupport: boolean; sideEffectPolicy: "runtime-owned-client"; notes: readonly string[]; createProvider(dependencies: McpDisconnectDependencies): McpDisconnectProvider | undefined };

export const mcpDisconnectDependencyDeclarations: readonly BaseToolDependencyDeclaration[] = [
  { dependencyId: "runtime.execEngine.mcp.disconnect", kind: "service", required: true, description: "Runtime-owned MCP disconnect support." },
  { dependencyId: "runtime.governancePlane.mcpApproval", kind: "permission", required: true, description: "dryRun:false requires explicit guard/governance approval before asking runtime to disconnect." },
  { dependencyId: "runtime.mcp.sessionTransport", kind: "runtime", required: true, description: "Connection cleanup, transport close, cancellation, and reconnect policy remain owned by runtime." },
];

export function createHostExecutorMcpDisconnectProvider(executor: BaseToolExecutorPort | undefined): McpDisconnectProvider | undefined {
  const disconnect = executor?.mcp?.disconnect;
  if (disconnect === undefined) return undefined;
  return async (request, context) => {
    const result = await disconnect({ ...request, context });
    if (!result.ok) throw new Error(result.error.message);
    return result.output;
  };
}
