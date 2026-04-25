import type { BaseToolDependencyDeclaration } from "../../../../../agentCore/agent_executionEngine/basic_toolLayer/baseTools/baseToolDefinition.js";
import type { BaseToolExecutorPort } from "../../../../../agentCore/agent_executionEngine/basic_toolLayer/baseTools/baseToolExecutorPort.js";
import type {
  ShellScriptExecutionProvider,
  ShellScriptExecutionProviderRequest,
} from "./core.js";
import type { ShellToolContext } from "../shell.commandExecution/core.js";

export type ShellScriptExecutionPracticeProviderName = "anthropic" | "openai" | "deepmind" | "praxis-native";

export type ShellScriptExecutionDependencies = {
  executor?: BaseToolExecutorPort;
  provider?: ShellScriptExecutionProvider;
};

export type ShellScriptExecutionProviderPractice = {
  providerName: ShellScriptExecutionPracticeProviderName;
  source: {
    kind: "cli" | "agent-sdk" | "api-sdk" | "praxis-native";
    label: string;
    path?: string;
  };
  directCliSupport: boolean;
  sideEffectPolicy: "runtime-governed";
  notes: readonly string[];
  createProvider(dependencies: ShellScriptExecutionDependencies): ShellScriptExecutionProvider | undefined;
};

export const shellScriptExecutionDependencyDeclarations = [
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

export function createHostExecutorShellScriptExecutionProvider(
  executor: BaseToolExecutorPort | undefined,
): ShellScriptExecutionProvider | undefined {
  const run = executor?.shell?.run;
  if (run === undefined) {
    return undefined;
  }

  return async (request: ShellScriptExecutionProviderRequest, _context: ShellToolContext) => {
    const result = await run({
      command: request.command,
      args: request.args,
      cwd: request.cwd,
      timeoutMs: request.timeoutMs,
      stdin: request.stdin,
    });

    if (!result.ok) {
      throw new Error(result.error.message);
    }

    return result.output;
  };
}
