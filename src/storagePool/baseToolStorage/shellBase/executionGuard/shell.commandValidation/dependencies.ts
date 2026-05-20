import type { BaseToolDependencyDeclaration } from "../../../../../agentCore_executionEngine/basic_toolLayer/baseTools/baseToolDefinition.js";
import type { BaseToolExecutorPort } from "../../../../../agentCore_executionEngine/basic_toolLayer/baseTools/baseToolExecutorPort.js";
import type { ShellCommandValidationOutput, ShellCommandValidationRequest } from "./core.js";

export type ShellCommandValidationPracticeProviderName = "anthropic" | "openai" | "deepmind" | "praxis-native";

export type ShellCommandValidationProvider = (
  request: ShellCommandValidationRequest,
  context: NonNullable<ShellCommandValidationRequest["context"]>,
) =>
  | ShellCommandValidationOutput
  | Partial<ShellCommandValidationOutput>
  | Promise<ShellCommandValidationOutput | Partial<ShellCommandValidationOutput>>;

export type ShellCommandValidationDependencies = {
  executor?: BaseToolExecutorPort;
  provider?: ShellCommandValidationProvider;
};

export type ShellCommandValidationProviderPractice = {
  providerName: ShellCommandValidationPracticeProviderName;
  source: {
    kind: "cli" | "agent-sdk" | "api-sdk" | "praxis-native";
    label: string;
    path?: string;
  };
  directCliSupport: boolean;
  sideEffectPolicy: "runtime-governed";
  notes: readonly string[];
  createProvider(dependencies: ShellCommandValidationDependencies): ShellCommandValidationProvider | undefined;
};

export const shellCommandValidationDependencyDeclarations = [
  {
    dependencyId: "runtime.execEngine.shellGuard.validateCommand",
    kind: "runtime",
    required: true,
    description: "Runtime-owned shell command validation port exposed through BaseToolExecutorPort.shell.validateCommand",
  },
  {
    dependencyId: "runtime.governancePlane.toolInvocationGrant",
    kind: "permission",
    required: true,
    description: "Runtime governance decision carried in context.guard for real command validation dispatch",
  },
] satisfies readonly BaseToolDependencyDeclaration[];

export function createHostExecutorShellCommandValidationProvider(
  executor: BaseToolExecutorPort | undefined,
): ShellCommandValidationProvider | undefined {
  const run = executor?.shell?.validateCommand;
  if (run === undefined) {
    return undefined;
  }

  return async (request, context) => {
    const result = await run({
      command: request.command ?? "",
      workingDirectory: request.workingDirectory,
      shell: request.shell ?? "sh",
      policy: request.policy as Readonly<Record<string, unknown>> | undefined,
      context: context as Readonly<Record<string, unknown>>,
    });

    if (!result.ok) {
      throw Object.assign(new Error(result.error.message), { publicSafe: result.error.publicSafe });
    }

    return result.output as Partial<ShellCommandValidationOutput>;
  };
}
