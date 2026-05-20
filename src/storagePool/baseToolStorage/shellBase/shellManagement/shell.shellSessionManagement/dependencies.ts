import type { BaseToolDependencyDeclaration } from "../../../../../agentCore/agent_executionEngine/basic_toolLayer/baseTools/baseToolDefinition.js";
import type { BaseToolExecutorPort } from "../../../../../agentCore/agent_executionEngine/basic_toolLayer/baseTools/baseToolExecutorPort.js";
import type { ShellToolContext } from "../../shellExecution/shell.commandExecution/core.js";
import type { ShellSessionManagementOutput, ShellSessionManagementRequest } from "./core.js";

export type ShellSessionManagementPracticeProviderName = "anthropic" | "openai" | "deepmind" | "praxis-native";
export type ShellSessionManagementProvider = (request: ShellSessionManagementRequest, context: ShellToolContext) => Readonly<Record<string, unknown>> | Promise<Readonly<Record<string, unknown>>>;
export type ShellSessionManagementDependencies = { executor?: BaseToolExecutorPort; provider?: ShellSessionManagementProvider };
export type ShellSessionManagementProviderPractice = {
  providerName: ShellSessionManagementPracticeProviderName;
  source: { kind: "cli" | "agent-sdk" | "api-sdk" | "praxis-native"; label: string; path?: string };
  directCliSupport: boolean;
  sideEffectPolicy: "runtime-governed";
  notes: readonly string[];
  createProvider(dependencies: ShellSessionManagementDependencies): ShellSessionManagementProvider | undefined;
};

export const shellSessionManagementDependencyDeclarations = [
  { dependencyId: "runtime.execEngine.shellManagement.manageSession", kind: "runtime", required: true, description: "Runtime-owned shell session management port exposed through BaseToolExecutorPort.shell.manageSession" },
  { dependencyId: "runtime.governancePlane.toolInvocationGrant", kind: "permission", required: true, description: "Runtime governance decision carried in context.guard for real session dispatch" },
  { dependencyId: "runtime.shellSessionOwnership", kind: "runtime", required: true, description: "Runtime owns shell sessions, handles, attachment state, and cleanup" },
] satisfies readonly BaseToolDependencyDeclaration[];

export function createHostExecutorShellSessionManagementProvider(executor: BaseToolExecutorPort | undefined): ShellSessionManagementProvider | undefined {
  const run = executor?.shell?.manageSession;
  if (run === undefined) return undefined;
  return async (request, context) => {
    const result = await run({ target: (request.target ?? {}) as Readonly<Record<string, unknown>>, context: context as Readonly<Record<string, unknown>> });
    if (!result.ok) throw new Error(result.error.message);
    return result.output;
  };
}
