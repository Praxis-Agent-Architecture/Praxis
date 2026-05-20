import type { BaseToolDependencyDeclaration } from "../../../../../agentCore_executionEngine/basic_toolLayer/baseTools/baseToolDefinition.js";
import type { BaseToolExecutorPort } from "../../../../../agentCore_executionEngine/basic_toolLayer/baseTools/baseToolExecutorPort.js";
import type { ShellToolContext } from "../../shellExecution/shell.commandExecution/core.js";
import type { ShellDetachedExecutionRequest } from "./core.js";

export type ShellDetachedExecutionPracticeProviderName = "anthropic" | "openai" | "deepmind" | "praxis-native";

export type ShellDetachedExecutionProviderResult = {
  resultEnvelope?: Readonly<Record<string, unknown>>;
  metadata?: Readonly<Record<string, unknown>>;
};

export type ShellDetachedExecutionProvider = (
  request: ShellDetachedExecutionRequest,
  context: ShellToolContext,
) => ShellDetachedExecutionProviderResult | Promise<ShellDetachedExecutionProviderResult>;

export type ShellDetachedExecutionDependencies = {
  executor?: BaseToolExecutorPort;
  provider?: ShellDetachedExecutionProvider;
};

export type ShellDetachedExecutionProviderPractice = {
  providerName: ShellDetachedExecutionPracticeProviderName;
  source: {
    kind: "cli" | "agent-sdk" | "api-sdk" | "praxis-native";
    label: string;
    path?: string;
  };
  directCliSupport: boolean;
  sideEffectPolicy: "runtime-governed";
  notes: readonly string[];
  createProvider(dependencies: ShellDetachedExecutionDependencies): ShellDetachedExecutionProvider | undefined;
};

export const shellDetachedExecutionDependencyDeclarations = [
  {
    dependencyId: "runtime.processLifecycle.detachedHandle",
    kind: "runtime",
    required: true,
    description: "Runtime-provided detached shell execution launch provider; baseTools do not own shell/process side effects",
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

export function createHostExecutorShellDetachedExecutionProvider(
  executor: BaseToolExecutorPort | undefined,
): ShellDetachedExecutionProvider | undefined {
  const startDetached = executor?.shell?.startDetached;
  if (startDetached === undefined) {
    return undefined;
  }

  return async (request: ShellDetachedExecutionRequest, context: ShellToolContext) => {
    const target = request.target ?? {};
    if (typeof target.command !== "string" || target.command.trim().length === 0) {
      throw new Error("shell.detachedExecution requires a runtime command target");
    }

    const result = await startDetached({
      command: target.command,
      shell: target.shell ?? "sh",
      cwd: typeof target.workingDirectory === "string" ? target.workingDirectory : undefined,
      launchId: typeof target.launchId === "string" && target.launchId.trim().length > 0 ? target.launchId : context.invocationId ?? "detached",
      pidFilePath: typeof target.pidFilePath === "string" ? target.pidFilePath : undefined,
      stdoutLogPath: typeof target.stdoutLogPath === "string" ? target.stdoutLogPath : undefined,
      stderrLogPath: typeof target.stderrLogPath === "string" ? target.stderrLogPath : undefined,
      restartPolicy: target.restartPolicy ?? "none",
      context,
    });
    if (!result.ok) {
      throw new Error(result.error.message);
    }

    const output = result.output as Readonly<Record<string, unknown>>;
    return {
      resultEnvelope: {
        ...output,
        detachedHandle: output.detachedHandle ?? output.launchId ?? context.invocationId ?? "detached",
        serviceStatus: output.serviceStatus ?? "started",
        verificationStatus: output.verificationStatus ?? "unverified",
        serviceLifecycle: output.serviceLifecycle ?? {
          verificationStatus: "not-run",
          userReachability: "not-verified",
          nextRequiredAction: "verify",
        },
      },
      metadata: { hostExecutor: "BaseToolExecutorPort.shell.startDetached", ...(result.metadata ?? {}) },
    };
  };
}
