import type { BaseToolDependencyDeclaration } from "../../../../../agentCore_executionEngine/basic_toolLayer/baseTools/baseToolDefinition.js";
import type { BaseToolExecutorPort } from "../../../../../agentCore_executionEngine/basic_toolLayer/baseTools/baseToolExecutorPort.js";
import type { ShellToolContext } from "../../shellExecution/shell.commandExecution/core.js";
import type { ShellProcessSpawningRequest } from "./core.js";

export type ShellProcessSpawningPracticeProviderName = "anthropic" | "openai" | "deepmind" | "praxis-native";

export type ShellProcessSpawningProviderResult = {
  resultEnvelope?: Readonly<Record<string, unknown>>;
  metadata?: Readonly<Record<string, unknown>>;
};

export type ShellProcessSpawningProvider = (
  request: ShellProcessSpawningRequest,
  context: ShellToolContext,
) => ShellProcessSpawningProviderResult | Promise<ShellProcessSpawningProviderResult>;

export type ShellProcessSpawningDependencies = {
  executor?: BaseToolExecutorPort;
  provider?: ShellProcessSpawningProvider;
};

export type ShellProcessSpawningProviderPractice = {
  providerName: ShellProcessSpawningPracticeProviderName;
  source: {
    kind: "cli" | "agent-sdk" | "api-sdk" | "praxis-native";
    label: string;
    path?: string;
  };
  directCliSupport: boolean;
  sideEffectPolicy: "runtime-governed";
  notes: readonly string[];
  createProvider(dependencies: ShellProcessSpawningDependencies): ShellProcessSpawningProvider | undefined;
};

export const shellProcessSpawningDependencyDeclarations = [
  {
    dependencyId: "runtime.processLifecycle.spawnHandle",
    kind: "runtime",
    required: true,
    description: "Runtime-provided shell process spawning provider; baseTools do not own shell/process side effects",
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

export function createHostExecutorShellProcessSpawningProvider(
  executor: BaseToolExecutorPort | undefined,
): ShellProcessSpawningProvider | undefined {
  const spawnProcess = executor?.shell?.spawnProcess;
  if (spawnProcess === undefined) {
    return undefined;
  }

  return async (request: ShellProcessSpawningRequest, context: ShellToolContext) => {
    const target = request.target ?? {};
    const command = typeof target.command === "string" ? target.command : target.executable;
    if (typeof command !== "string" || command.trim().length === 0) {
      throw new Error("shell.processSpawning requires a runtime command target");
    }

    const result = await spawnProcess({
      target,
      launchMode: request.launchMode ?? "foreground",
      context,
    });
    if (!result.ok) {
      throw new Error(result.error.message);
    }

    const output = result.output as Readonly<Record<string, unknown>>;
    const launchMode = request.launchMode ?? "foreground";
    const lifecycleFields = launchMode === "foreground"
      ? {}
      : {
        serviceStatus: output.serviceStatus ?? "started",
        verificationStatus: output.verificationStatus ?? "unverified",
        serviceLifecycle: output.serviceLifecycle ?? {
          verificationStatus: "not-run",
          userReachability: "not-verified",
          nextRequiredAction: "verify",
        },
      };
    return {
      resultEnvelope: {
        ...output,
        ...lifecycleFields,
      },
      metadata: { hostExecutor: "BaseToolExecutorPort.shell.spawnProcess", ...(result.metadata ?? {}) },
    };
  };
}
