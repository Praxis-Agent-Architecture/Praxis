import type { BaseToolDependencyDeclaration } from "../../../../../agentCore_executionEngine/basic_toolLayer/baseTools/baseToolDefinition.js";
import type { BaseToolExecutorPort } from "../../../../../agentCore_executionEngine/basic_toolLayer/baseTools/baseToolExecutorPort.js";
import type { ShellToolContext } from "../../shellExecution/shell.commandExecution/core.js";
import type { ShellBackgroundExecutionRequest } from "./core.js";

export type ShellBackgroundExecutionPracticeProviderName = "anthropic" | "openai" | "deepmind" | "praxis-native";

export type ShellBackgroundExecutionProviderResult = {
  resultEnvelope?: Readonly<Record<string, unknown>>;
  metadata?: Readonly<Record<string, unknown>>;
};

export type ShellBackgroundExecutionProvider = (
  request: ShellBackgroundExecutionRequest,
  context: ShellToolContext,
) => ShellBackgroundExecutionProviderResult | Promise<ShellBackgroundExecutionProviderResult>;

export type ShellBackgroundExecutionDependencies = {
  executor?: BaseToolExecutorPort;
  provider?: ShellBackgroundExecutionProvider;
};

export type ShellBackgroundExecutionProviderPractice = {
  providerName: ShellBackgroundExecutionPracticeProviderName;
  source: {
    kind: "cli" | "agent-sdk" | "api-sdk" | "praxis-native";
    label: string;
    path?: string;
  };
  directCliSupport: boolean;
  sideEffectPolicy: "runtime-governed";
  notes: readonly string[];
  createProvider(dependencies: ShellBackgroundExecutionDependencies): ShellBackgroundExecutionProvider | undefined;
};

export const shellBackgroundExecutionDependencyDeclarations = [
  {
    dependencyId: "runtime.processLifecycle.backgroundHandle",
    kind: "runtime",
    required: true,
    description: "Runtime-provided background shell execution job provider; baseTools do not own shell/process side effects",
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

export function createHostExecutorShellBackgroundExecutionProvider(
  executor: BaseToolExecutorPort | undefined,
): ShellBackgroundExecutionProvider | undefined {
  const startBackground = executor?.shell?.startBackground;
  if (startBackground === undefined) {
    return undefined;
  }

  return async (request: ShellBackgroundExecutionRequest, context: ShellToolContext) => {
    const target = request.target ?? {};
    if (typeof target.command !== "string" || target.command.trim().length === 0) {
      throw new Error("shell.backgroundExecution requires a runtime command target");
    }

    const result = await startBackground({
      command: target.command,
      shell: target.shell ?? "sh",
      cwd: typeof target.workingDirectory === "string" ? target.workingDirectory : undefined,
      jobId: typeof target.jobId === "string" && target.jobId.trim().length > 0 ? target.jobId : context.invocationId ?? "background",
      monitorIntervalMs: typeof target.monitorIntervalMs === "number" ? target.monitorIntervalMs : 1_000,
      outputBufferLimitBytes: typeof target.outputBufferLimitBytes === "number" ? target.outputBufferLimitBytes : 64 * 1024,
      captureOutput: target.captureOutput !== false,
      context,
    });
    if (!result.ok) {
      throw new Error(result.error.message);
    }

    const output = result.output as Readonly<Record<string, unknown>>;
    return {
      resultEnvelope: {
        ...output,
        backgroundHandle: output.backgroundHandle ?? output.jobId ?? context.invocationId ?? "background",
        serviceStatus: output.serviceStatus ?? "started",
        verificationStatus: output.verificationStatus ?? "unverified",
        serviceLifecycle: output.serviceLifecycle ?? {
          verificationStatus: "not-run",
          userReachability: "not-verified",
          nextRequiredAction: "verify",
        },
      },
      metadata: { hostExecutor: "BaseToolExecutorPort.shell.startBackground", ...(result.metadata ?? {}) },
    };
  };
}
