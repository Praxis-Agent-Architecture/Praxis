import type { BaseToolDependencyDeclaration } from "../../../../../agentCore_executionEngine/basic_toolLayer/baseTools/baseToolDefinition.js";
import type { BaseToolExecutorPort } from "../../../../../agentCore_executionEngine/basic_toolLayer/baseTools/baseToolExecutorPort.js";
import type { ShellExecutionMonitoringOutput, ShellExecutionMonitoringRequest } from "./core.js";

export type ShellExecutionMonitoringPracticeProviderName = "anthropic" | "openai" | "deepmind" | "praxis-native";

export type ShellExecutionMonitoringProviderRequest = ShellExecutionMonitoringRequest;

export type ShellExecutionMonitoringProvider = (
  request: ShellExecutionMonitoringProviderRequest,
  context: NonNullable<ShellExecutionMonitoringRequest["context"]>,
) => ShellExecutionMonitoringOutput | Partial<ShellExecutionMonitoringOutput> | Promise<ShellExecutionMonitoringOutput | Partial<ShellExecutionMonitoringOutput>>;

export type ShellExecutionMonitoringDependencies = {
  executor?: BaseToolExecutorPort;
  provider?: ShellExecutionMonitoringProvider;
};

export type ShellExecutionMonitoringProviderPractice = {
  providerName: ShellExecutionMonitoringPracticeProviderName;
  source: { kind: "cli" | "agent-sdk" | "api-sdk" | "praxis-native"; label: string; path?: string };
  directCliSupport: boolean;
  sideEffectPolicy: "runtime-governed";
  notes: readonly string[];
  createProvider(dependencies: ShellExecutionMonitoringDependencies): ShellExecutionMonitoringProvider | undefined;
};

export const executionMonitoringDependencyDeclarations = [
  { dependencyId: "runtime.execEngine.shellInteraction.monitorExecution", kind: "runtime", required: true, description: "Runtime-owned shell interaction port exposed through BaseToolExecutorPort.shell.monitorExecution" },
  { dependencyId: "runtime.governancePlane.toolInvocationGrant", kind: "permission", required: true, description: "Runtime governance decision carried in context.guard for real interaction dispatch" },
  { dependencyId: "runtime.shellSessionOwnership", kind: "runtime", required: true, description: "Runtime owns shell session/process lifecycle and validates session scope before side effects" },
] satisfies readonly BaseToolDependencyDeclaration[];

export function createHostExecutorShellExecutionMonitoringProvider(executor: BaseToolExecutorPort | undefined): ShellExecutionMonitoringProvider | undefined {
  const run = executor?.shell?.monitorExecution;
  if (run === undefined) return undefined;
  return async (request, context) => {
    const result = await run({
      target: (request.target ?? {}) as Readonly<Record<string, unknown>>,
      observation: (request.observation ?? undefined) as Readonly<Record<string, unknown>> | undefined,
      staleAfterMs: request.staleAfterMs,
      context: context as Readonly<Record<string, unknown>>,
    });
    if (!result.ok) throw new Error(result.error.message);
    return result.output as Partial<ShellExecutionMonitoringOutput>;
  };
}
