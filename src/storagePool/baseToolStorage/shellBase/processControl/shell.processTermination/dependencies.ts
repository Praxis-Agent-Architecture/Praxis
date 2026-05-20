import type { BaseToolDependencyDeclaration } from "../../../../../agentCore_executionEngine/basic_toolLayer/baseTools/baseToolDefinition.js";
import type { BaseToolExecutorPort } from "../../../../../agentCore_executionEngine/basic_toolLayer/baseTools/baseToolExecutorPort.js";
import type { ShellToolContext } from "../../shellExecution/shell.commandExecution/core.js";
import type { ShellProcessTerminationRequest } from "./core.js";

export type ShellProcessTerminationPracticeProviderName = "anthropic" | "openai" | "deepmind" | "praxis-native";

export type ShellProcessTerminationProviderResult = {
  resultEnvelope?: Readonly<Record<string, unknown>>;
  metadata?: Readonly<Record<string, unknown>>;
};

export type ShellProcessTerminationProvider = (
  request: ShellProcessTerminationRequest,
  context: ShellToolContext,
) => ShellProcessTerminationProviderResult | Promise<ShellProcessTerminationProviderResult>;

export type ShellProcessTerminationDependencies = {
  executor?: BaseToolExecutorPort;
  provider?: ShellProcessTerminationProvider;
};

export type ShellProcessTerminationProviderPractice = {
  providerName: ShellProcessTerminationPracticeProviderName;
  source: {
    kind: "cli" | "agent-sdk" | "api-sdk" | "praxis-native";
    label: string;
    path?: string;
  };
  directCliSupport: boolean;
  sideEffectPolicy: "runtime-governed";
  notes: readonly string[];
  createProvider(dependencies: ShellProcessTerminationDependencies): ShellProcessTerminationProvider | undefined;
};

export const shellProcessTerminationDependencyDeclarations = [
  {
    dependencyId: "runtime.processLifecycle.termination",
    kind: "runtime",
    required: true,
    description: "Runtime-provided shell process termination provider; baseTools do not own shell/process side effects",
  },
  {
    dependencyId: "runtime.governancePlane.toolInvocationGrant",
    kind: "permission",
    required: true,
    description: "Runtime governance decision carried in context.guard for real execution",
  },
  {
    dependencyId: "runtime.capabilityExposure.shellAuditEnvelope",
    kind: "runtime",
    required: true,
    description: "Runtime audit envelope for process lifecycle and shell output material",
  },
] satisfies readonly BaseToolDependencyDeclaration[];

export function createHostExecutorShellProcessTerminationProvider(
  executor: BaseToolExecutorPort | undefined,
): ShellProcessTerminationProvider | undefined {
  const terminateProcess = executor?.shell?.terminateProcess;
  if (terminateProcess === undefined) {
    return undefined;
  }

  return async (request: ShellProcessTerminationRequest, context: ShellToolContext) => {
    const target = request.target ?? {};
    const processId = target.processId;
    if (typeof processId !== "number" || !Number.isSafeInteger(processId) || processId <= 0) {
      throw new Error("shell.processTermination requires a runtime process id target");
    }

    const signal = target.signal ?? (target.force === true ? "SIGKILL" : "SIGTERM");
    const result = await terminateProcess({
      processId,
      signal,
      reason: typeof target.reason === "string" ? target.reason : undefined,
      force: target.force === true || signal === "SIGKILL",
      context,
    });
    if (!result.ok) {
      throw new Error(result.error.message);
    }

    return {
      resultEnvelope: result.output,
      metadata: { hostExecutor: "BaseToolExecutorPort.shell.terminateProcess", ...(result.metadata ?? {}) },
    };
  };
}
