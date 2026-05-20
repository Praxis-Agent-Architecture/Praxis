import type { BaseToolDependencyDeclaration } from "../../../../../agentCore_executionEngine/basic_toolLayer/baseTools/baseToolDefinition.js";
import type { BaseToolExecutorPort } from "../../../../../agentCore_executionEngine/basic_toolLayer/baseTools/baseToolExecutorPort.js";
import type {
  ShellExitCodeCheckingProvider,
  ShellExitCodeCheckingProviderResult,
} from "./core.js";

export type ShellExitCodeCheckingPracticeProviderName = "anthropic" | "openai" | "deepmind" | "praxis-native";

export type ShellExitCodeCheckingDependencies = {
  executor?: BaseToolExecutorPort;
  provider?: ShellExitCodeCheckingProvider;
};

export type ShellExitCodeCheckingProviderPractice = {
  providerName: ShellExitCodeCheckingPracticeProviderName;
  source: { kind: "cli" | "agent-sdk" | "api-sdk" | "praxis-native"; label: string; path?: string };
  directCliSupport: boolean;
  sideEffectPolicy: "runtime-governed";
  notes: readonly string[];
  createProvider(dependencies: ShellExitCodeCheckingDependencies): ShellExitCodeCheckingProvider | undefined;
};

export const shellExitCodeCheckingDependencyDeclarations = [
  {
    dependencyId: "runtime.execEngine.shellExecution.monitorExecution",
    kind: "runtime",
    required: true,
    description: "Runtime-owned shell execution observation port exposed through BaseToolExecutorPort.shell.monitorExecution",
  },
  {
    dependencyId: "runtime.governancePlane.toolInvocationGrant",
    kind: "permission",
    required: true,
    description: "Runtime governance decision carried in context.guard for real observation dispatch",
  },
  {
    dependencyId: "runtime.shellProcessOwnership",
    kind: "runtime",
    required: true,
    description: "Runtime owns shell process lifecycle and supplies exit observations; baseTool only classifies them",
  },
] satisfies readonly BaseToolDependencyDeclaration[];

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function observationEnvelope(output: Readonly<Record<string, unknown>>): Readonly<Record<string, unknown>> {
  return isRecord(output.observation) ? output.observation : output;
}

export function createHostExecutorShellExitCodeCheckingProvider(
  executor: BaseToolExecutorPort | undefined,
): ShellExitCodeCheckingProvider | undefined {
  const monitorExecution = executor?.shell?.monitorExecution;
  if (monitorExecution === undefined) return undefined;

  return async (request, context) => {
    const result = await monitorExecution({
      target: { toolId: "shell.exitCodeChecking", executionId: request.executionId, command: request.command },
      observation: {
        exitCode: request.exitCode,
        signal: request.signal,
        timedOut: request.timedOut,
        policy: request.policy,
      },
      context: context as Readonly<Record<string, unknown>>,
    });
    if (!result.ok) throw new Error(result.error.message);
    const output = isRecord(result.output) ? observationEnvelope(result.output) : {};
    return {
      command: typeof output.command === "string" ? output.command : undefined,
      exitCode:
        typeof output.exitCode === "number" || output.exitCode === null
          ? output.exitCode
          : output.exitCode === undefined
            ? undefined
            : Number.NaN,
      signal:
        typeof output.signal === "string" || output.signal === null
          ? output.signal
          : output.signal === undefined
            ? undefined
            : (0 as unknown as string),
      timedOut:
        typeof output.timedOut === "boolean"
          ? output.timedOut
          : output.timedOut === undefined
            ? undefined
            : (0 as unknown as boolean),
    } satisfies ShellExitCodeCheckingProviderResult;
  };
}
