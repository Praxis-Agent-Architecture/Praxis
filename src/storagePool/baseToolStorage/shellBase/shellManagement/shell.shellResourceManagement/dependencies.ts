import type { BaseToolDependencyDeclaration } from "../../../../../agentCore_executionEngine/basic_toolLayer/baseTools/baseToolDefinition.js";
import type { BaseToolExecutorPort } from "../../../../../agentCore_executionEngine/basic_toolLayer/baseTools/baseToolExecutorPort.js";
import type { ShellToolContext } from "../../shellExecution/shell.commandExecution/core.js";
import type { ShellResourceManagementOutput, ShellResourceManagementRequest } from "./core.js";

export type ShellResourceManagementPracticeProviderName = "anthropic" | "openai" | "deepmind" | "praxis-native";
export type ShellResourceManagementProvider = (request: ShellResourceManagementRequest, context: ShellToolContext) => Readonly<Record<string, unknown>> | Promise<Readonly<Record<string, unknown>>>;
export type ShellResourceManagementDependencies = { executor?: BaseToolExecutorPort; provider?: ShellResourceManagementProvider };
export type ShellResourceManagementProviderPractice = {
  providerName: ShellResourceManagementPracticeProviderName;
  source: { kind: "cli" | "agent-sdk" | "api-sdk" | "praxis-native"; label: string; path?: string };
  directCliSupport: boolean;
  sideEffectPolicy: "runtime-governed";
  notes: readonly string[];
  createProvider(dependencies: ShellResourceManagementDependencies): ShellResourceManagementProvider | undefined;
};

export const shellResourceManagementDependencyDeclarations = [
  { dependencyId: "runtime.execEngine.shellManagement.manageResource", kind: "runtime", required: true, description: "Runtime-owned shell resource management port exposed through BaseToolExecutorPort.shell.manageResource" },
  { dependencyId: "runtime.governancePlane.toolInvocationGrant", kind: "permission", required: true, description: "Runtime governance decision carried in context.guard for real resource dispatch" },
  { dependencyId: "runtime.shellResourceOwnership", kind: "runtime", required: true, description: "Runtime owns shell resource reservation, release, limit changes, and resource-scope checks" },
] satisfies readonly BaseToolDependencyDeclaration[];

export function createHostExecutorShellResourceManagementProvider(executor: BaseToolExecutorPort | undefined): ShellResourceManagementProvider | undefined {
  const run = executor?.shell?.manageResource;
  if (run === undefined) return undefined;
  return async (request, context) => {
    const result = await run({ target: (request.target ?? {}) as Readonly<Record<string, unknown>>, context: context as Readonly<Record<string, unknown>> });
    if (!result.ok) throw new Error(result.error.message);
    return result.output;
  };
}
