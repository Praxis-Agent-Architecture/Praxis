import type { BaseToolDependencyDeclaration } from "../../../../../agentCore/agent_executionEngine/basic_toolLayer/baseTools/baseToolDefinition.js";
import type { BaseToolExecutorPort } from "../../../../../agentCore/agent_executionEngine/basic_toolLayer/baseTools/baseToolExecutorPort.js";
import type { ShellToolContext } from "../../shellExecution/shell.commandExecution/core.js";
import type { ShellProcessManagementOutput, ShellProcessManagementRequest } from "./core.js";

export type ShellProcessManagementPracticeProviderName = "anthropic" | "openai" | "deepmind" | "praxis-native";
export type ShellProcessManagementProvider = (request: ShellProcessManagementRequest, context: ShellToolContext) => Readonly<Record<string, unknown>> | Promise<Readonly<Record<string, unknown>>>;
export type ShellProcessManagementDependencies = { executor?: BaseToolExecutorPort; provider?: ShellProcessManagementProvider };
export type ShellProcessManagementProviderPractice = {
  providerName: ShellProcessManagementPracticeProviderName;
  source: { kind: "cli" | "agent-sdk" | "api-sdk" | "praxis-native"; label: string; path?: string };
  directCliSupport: boolean;
  sideEffectPolicy: "runtime-governed";
  notes: readonly string[];
  createProvider(dependencies: ShellProcessManagementDependencies): ShellProcessManagementProvider | undefined;
};

export const shellProcessManagementDependencyDeclarations = [
  { dependencyId: "runtime.execEngine.shellManagement.manageProcess", kind: "runtime", required: true, description: "Runtime-owned shell process management port exposed through BaseToolExecutorPort.shell.manageProcess" },
  { dependencyId: "runtime.governancePlane.toolInvocationGrant", kind: "permission", required: true, description: "Runtime governance decision carried in context.guard for real process dispatch" },
  { dependencyId: "runtime.shellProcessOwnership", kind: "runtime", required: true, description: "Runtime owns process handles, signaling, reaping, priority changes, and process scope checks" },
] satisfies readonly BaseToolDependencyDeclaration[];

export function createHostExecutorShellProcessManagementProvider(executor: BaseToolExecutorPort | undefined): ShellProcessManagementProvider | undefined {
  const run = executor?.shell?.manageProcess;
  if (run === undefined) return undefined;
  return async (request, context) => {
    const result = await run({ target: (request.target ?? {}) as Readonly<Record<string, unknown>>, context: context as Readonly<Record<string, unknown>> });
    if (!result.ok) throw new Error(result.error.message);
    return result.output;
  };
}
