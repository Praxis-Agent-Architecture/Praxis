import type { BaseToolDependencyDeclaration } from "../../../../../agentCore/agent_executionEngine/basic_toolLayer/baseTools/baseToolDefinition.js";
import type { BaseToolExecutorPort } from "../../../../../agentCore/agent_executionEngine/basic_toolLayer/baseTools/baseToolExecutorPort.js";
import type {
  ShellCommandExecutionProvider,
  ShellCommandExecutionProviderRequest,
  ShellToolContext,
} from "./core.js";

export type ShellCommandExecutionPracticeProviderName = "anthropic" | "openai" | "deepmind" | "praxis-native";

export type ShellCommandExecutionDependencies = {
  executor?: BaseToolExecutorPort;
  provider?: ShellCommandExecutionProvider;
};

export type ShellCommandExecutionProviderPractice = {
  providerName: ShellCommandExecutionPracticeProviderName;
  source: {
    kind: "cli" | "agent-sdk" | "api-sdk" | "praxis-native";
    label: string;
    path?: string;
  };
  directCliSupport: boolean;
  sideEffectPolicy: "runtime-governed";
  notes: readonly string[];
  createProvider(dependencies: ShellCommandExecutionDependencies): ShellCommandExecutionProvider | undefined;
};

export const shellCommandExecutionDependencyDeclarations = [
  {
    dependencyId: "runtime.execEngine.shellExecutor",
    kind: "runtime",
    required: true,
    description: "Runtime-provided shell executor exposed through BaseToolExecutorPort.shell.run",
  },
  {
    dependencyId: "runtime.governancePlane.toolInvocationGrant",
    kind: "permission",
    required: true,
    description: "Runtime governance decision carried in ShellToolContext.guard",
  },
  {
    dependencyId: "runtime.capabilityExposure.shellOutputEnvelope",
    kind: "runtime",
    required: true,
    description: "Runtime output envelope for stdout, stderr, exit code, and audit material",
  },
] satisfies readonly BaseToolDependencyDeclaration[];

export function createHostExecutorShellCommandExecutionProvider(
  executor: BaseToolExecutorPort | undefined,
): ShellCommandExecutionProvider | undefined {
  const run = executor?.shell?.run;
  if (run === undefined) {
    return undefined;
  }

  return async (request: ShellCommandExecutionProviderRequest, _context: ShellToolContext) => {
    const result = await run({
      command: request.command,
      args: request.args,
      cwd: request.cwd,
      timeoutMs: request.timeoutMs,
      stdin: request.stdin,
    });

    if (!result.ok) {
      const error = new Error(result.error.message);
      error.name = result.error.code;
      throw error;
    }

    return result.output;
  };
}
