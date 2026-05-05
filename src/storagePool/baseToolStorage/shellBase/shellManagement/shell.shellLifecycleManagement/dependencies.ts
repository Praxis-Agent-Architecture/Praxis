import type { BaseToolDependencyDeclaration } from "../../../../../agentCore/agent_executionEngine/basic_toolLayer/baseTools/baseToolDefinition.js";
import type { BaseToolExecutorPort } from "../../../../../agentCore/agent_executionEngine/basic_toolLayer/baseTools/baseToolExecutorPort.js";
import type { ShellToolContext } from "../../shellExecution/shell.commandExecution/core.js";
import type { ShellLifecycleManagementOutput, ShellLifecycleManagementRequest } from "./core.js";

export type ShellLifecycleManagementPracticeProviderName = "anthropic" | "openai" | "deepmind" | "praxis-native";

export type ShellLifecycleManagementProvider = (
  request: ShellLifecycleManagementRequest,
  context: ShellToolContext,
) =>
  | Readonly<Record<string, unknown>>
  | Promise<Readonly<Record<string, unknown>>>;

export type ShellLifecycleManagementDependencies = {
  executor?: BaseToolExecutorPort;
  provider?: ShellLifecycleManagementProvider;
};

export type ShellLifecycleManagementProviderPractice = {
  providerName: ShellLifecycleManagementPracticeProviderName;
  source: { kind: "cli" | "agent-sdk" | "api-sdk" | "praxis-native"; label: string; path?: string };
  directCliSupport: boolean;
  sideEffectPolicy: "runtime-governed";
  notes: readonly string[];
  createProvider(dependencies: ShellLifecycleManagementDependencies): ShellLifecycleManagementProvider | undefined;
};

export const shellLifecycleManagementDependencyDeclarations = [
  {
    dependencyId: "runtime.execEngine.shellManagement.manageLifecycle",
    kind: "runtime",
    required: true,
    description: "Runtime-owned shell lifecycle management port exposed through BaseToolExecutorPort.shell.manageLifecycle",
  },
  {
    dependencyId: "runtime.governancePlane.toolInvocationGrant",
    kind: "permission",
    required: true,
    description: "Runtime governance decision carried in context.guard for real lifecycle dispatch",
  },
  {
    dependencyId: "runtime.shellSessionOwnership",
    kind: "runtime",
    required: true,
    description: "Runtime owns shell session lifecycle, handles, approval, and resource cleanup",
  },
] satisfies readonly BaseToolDependencyDeclaration[];

export function createHostExecutorShellLifecycleManagementProvider(
  executor: BaseToolExecutorPort | undefined,
): ShellLifecycleManagementProvider | undefined {
  const run = executor?.shell?.manageLifecycle;
  if (run === undefined) return undefined;
  return async (request, context) => {
    const result = await run({
      target: (request.target ?? {}) as Readonly<Record<string, unknown>>,
      context: context as Readonly<Record<string, unknown>>,
    });
    if (!result.ok) throw new Error(result.error.message);
    return result.output;
  };
}
