import type { BaseToolDependencyDeclaration } from "../../../../../executionEngine/basic_toolLayer/baseTools/baseToolDefinition.js";
import type { BaseToolExecutorPort } from "../../../../../executionEngine/basic_toolLayer/baseTools/baseToolExecutorPort.js";
import type {
  ShellInvocationExecutionProvider,
  ShellInvocationExecutionProviderRequest,
} from "./core.js";
import type { ShellToolContext } from "../shell.commandExecution/core.js";
import { ShellInvocationExecutionProviderUnavailableError } from "./core.js";

export type ShellInvocationExecutionPracticeProviderName = "anthropic" | "openai" | "deepmind" | "praxis-native";

export type ShellInvocationExecutionDependencies = {
  executor?: BaseToolExecutorPort;
  provider?: ShellInvocationExecutionProvider;
};

export type ShellInvocationExecutionProviderPractice = {
  providerName: ShellInvocationExecutionPracticeProviderName;
  source: {
    kind: "cli" | "agent-sdk" | "api-sdk" | "praxis-native";
    label: string;
    path?: string;
  };
  directCliSupport: boolean;
  sideEffectPolicy: "runtime-governed";
  notes: readonly string[];
  createProvider(dependencies: ShellInvocationExecutionDependencies): ShellInvocationExecutionProvider | undefined;
};

export const shellInvocationExecutionDependencyDeclarations = [
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

export function createHostExecutorShellInvocationExecutionProvider(
  executor: BaseToolExecutorPort | undefined,
): ShellInvocationExecutionProvider | undefined {
  const run = executor?.shell?.run;
  if (run === undefined) {
    return undefined;
  }

  return async (request: ShellInvocationExecutionProviderRequest, _context: ShellToolContext) => {
    if (Object.keys(request.env).length > 0) {
      throw new ShellInvocationExecutionProviderUnavailableError(
        "runtime shell executor does not support invocation env overrides",
      );
    }

    const result = await run({
      command: request.executable,
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
