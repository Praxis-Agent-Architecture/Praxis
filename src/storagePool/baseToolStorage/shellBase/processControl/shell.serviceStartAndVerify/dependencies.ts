import type { BaseToolDependencyDeclaration } from "../../../../../agentCore/agent_executionEngine/basic_toolLayer/baseTools/baseToolDefinition.js";
import type {
  BaseToolExecutorPort,
  BaseToolShellServiceVerification,
} from "../../../../../agentCore/agent_executionEngine/basic_toolLayer/baseTools/baseToolExecutorPort.js";
import type { ShellToolContext } from "../../shellExecution/shell.commandExecution/core.js";
import type { ShellServiceStartAndVerifyRequest } from "./core.js";

export type ShellServiceStartAndVerifyPracticeProviderName = "anthropic" | "openai" | "deepmind" | "praxis-native";

export type ShellServiceStartAndVerifyProviderResult = {
  resultEnvelope?: Readonly<Record<string, unknown>>;
  metadata?: Readonly<Record<string, unknown>>;
};

export type ShellServiceStartAndVerifyProvider = (
  request: ShellServiceStartAndVerifyRequest,
  context: ShellToolContext,
) => ShellServiceStartAndVerifyProviderResult | Promise<ShellServiceStartAndVerifyProviderResult>;

export type ShellServiceStartAndVerifyDependencies = {
  executor?: BaseToolExecutorPort;
  provider?: ShellServiceStartAndVerifyProvider;
};

export type ShellServiceStartAndVerifyProviderPractice = {
  providerName: ShellServiceStartAndVerifyPracticeProviderName;
  source: {
    kind: "cli" | "agent-sdk" | "api-sdk" | "praxis-native";
    label: string;
    path?: string;
  };
  directCliSupport: boolean;
  sideEffectPolicy: "runtime-governed";
  notes: readonly string[];
  createProvider(dependencies: ShellServiceStartAndVerifyDependencies): ShellServiceStartAndVerifyProvider | undefined;
};

export const shellServiceStartAndVerifyDependencyDeclarations = [
  {
    dependencyId: "runtime.processLifecycle.serviceStartAndVerify",
    kind: "runtime",
    required: true,
    description: "Runtime-provided service lifecycle provider through BaseToolExecutorPort.shell.startServiceAndVerify; baseTools do not own shell/process or reachability side effects",
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
    description: "Runtime audit envelope for service lifecycle, verification state, and shell output material",
  },
] satisfies readonly BaseToolDependencyDeclaration[];

function executorVerification(value: unknown): BaseToolShellServiceVerification {
  const record = typeof value === "object" && value !== null && !Array.isArray(value)
    ? value as Readonly<Record<string, unknown>>
    : {};
  const kind = typeof record.kind === "string"
    ? record.kind
    : typeof record.type === "string"
      ? record.type
      : "process";
  if (kind === "tcp") {
    return {
      kind,
      host: typeof record.host === "string" ? record.host : undefined,
      port: typeof record.port === "number" ? record.port : 0,
      timeoutMs: typeof record.timeoutMs === "number" ? record.timeoutMs : undefined,
      intervalMs: typeof record.intervalMs === "number" ? record.intervalMs : undefined,
      maxAttempts: typeof record.maxAttempts === "number" ? record.maxAttempts : undefined,
    };
  }
  if (kind === "http") {
    return {
      kind,
      url: typeof record.url === "string" ? record.url : "",
      expectedStatus: typeof record.expectedStatus === "number" ? record.expectedStatus : undefined,
      expectedText: typeof record.expectedText === "string" ? record.expectedText : undefined,
      method: record.method === "GET" || record.method === "HEAD" || record.method === "POST" ? record.method : undefined,
      timeoutMs: typeof record.timeoutMs === "number" ? record.timeoutMs : undefined,
      intervalMs: typeof record.intervalMs === "number" ? record.intervalMs : undefined,
      maxAttempts: typeof record.maxAttempts === "number" ? record.maxAttempts : undefined,
    };
  }
  if (kind === "log") {
    return {
      kind,
      pattern: typeof record.pattern === "string" ? record.pattern : "",
      stream: record.stream === "stdout" || record.stream === "stderr" || record.stream === "both" ? record.stream : undefined,
      regex: record.regex === true,
      timeoutMs: typeof record.timeoutMs === "number" ? record.timeoutMs : undefined,
      intervalMs: typeof record.intervalMs === "number" ? record.intervalMs : undefined,
      maxAttempts: typeof record.maxAttempts === "number" ? record.maxAttempts : undefined,
    };
  }
  if (kind === "command") {
    return {
      kind,
      command: typeof record.command === "string" ? record.command : "",
      args: Array.isArray(record.args) ? record.args.filter((item): item is string => typeof item === "string") : undefined,
      cwd: typeof record.cwd === "string" ? record.cwd : undefined,
      expectedText: typeof record.expectedText === "string" ? record.expectedText : undefined,
      timeoutMs: typeof record.timeoutMs === "number" ? record.timeoutMs : undefined,
      intervalMs: typeof record.intervalMs === "number" ? record.intervalMs : undefined,
      maxAttempts: typeof record.maxAttempts === "number" ? record.maxAttempts : undefined,
    };
  }
  return {
    kind: "process",
    timeoutMs: typeof record.timeoutMs === "number" ? record.timeoutMs : undefined,
    intervalMs: typeof record.intervalMs === "number" ? record.intervalMs : undefined,
    maxAttempts: typeof record.maxAttempts === "number" ? record.maxAttempts : undefined,
  };
}

export function createHostExecutorShellServiceStartAndVerifyProvider(
  executor: BaseToolExecutorPort | undefined,
): ShellServiceStartAndVerifyProvider | undefined {
  const startServiceAndVerify = executor?.shell?.startServiceAndVerify;
  if (startServiceAndVerify === undefined) {
    return undefined;
  }

  return async (request: ShellServiceStartAndVerifyRequest, context: ShellToolContext) => {
    const target = request.target ?? {};
    if (typeof target.command !== "string" || target.command.trim().length === 0) {
      throw new Error("shell.serviceStartAndVerify requires a runtime command target");
    }
    if (target.verification === undefined && target.probe === undefined) {
      throw new Error("shell.serviceStartAndVerify requires runtime verification target");
    }
    const verification = executorVerification(target.verification ?? target.probe);

    const result = await startServiceAndVerify({
      start: {
        command: target.command,
        shell: target.shell ?? "sh",
        cwd: typeof target.workingDirectory === "string" ? target.workingDirectory : undefined,
        serviceId: typeof target.serviceId === "string" && target.serviceId.trim().length > 0 ? target.serviceId : context.invocationId ?? "service",
        launchMode: target.launchMode ?? "background",
        restartPolicy: target.restartPolicy ?? "none",
        outputBufferLimitBytes: typeof target.outputBufferLimitBytes === "number" ? target.outputBufferLimitBytes : 64 * 1024,
        captureOutput: target.captureOutput !== false,
      },
      verification,
      context,
    });
    if (!result.ok) {
      throw new Error(result.error.message);
    }

    const output = result.output as Readonly<Record<string, unknown>>;
    return {
      resultEnvelope: {
        ...output,
        serviceHandle: output.serviceHandle ?? output.serviceId ?? context.invocationId ?? "service",
        serviceStatus: output.serviceStatus ?? output.status ?? "unverified",
        verificationStatus: output.verificationStatus ?? output.status ?? "unverified",
      },
      metadata: { hostExecutor: "BaseToolExecutorPort.shell.startServiceAndVerify", ...(result.metadata ?? {}) },
    };
  };
}
