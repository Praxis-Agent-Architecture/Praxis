import type { BaseToolDependencyDeclaration } from "../../../../../executionEngine/basic_toolLayer/baseTools/baseToolDefinition.js";
import type { BaseToolExecutorPort } from "../../../../../executionEngine/basic_toolLayer/baseTools/baseToolExecutorPort.js";
import type { ShellSandboxEnforcementOutput, ShellSandboxEnforcementRequest } from "./core.js";

export type ShellSandboxEnforcementPracticeProviderName = "anthropic" | "openai" | "deepmind" | "praxis-native";

export type ShellSandboxEnforcementProvider = (
  request: ShellSandboxEnforcementRequest,
  context: NonNullable<ShellSandboxEnforcementRequest["context"]>,
) =>
  | ShellSandboxEnforcementOutput
  | Partial<ShellSandboxEnforcementOutput>
  | Promise<ShellSandboxEnforcementOutput | Partial<ShellSandboxEnforcementOutput>>;

export type ShellSandboxEnforcementDependencies = {
  executor?: BaseToolExecutorPort;
  provider?: ShellSandboxEnforcementProvider;
};

export type ShellSandboxEnforcementProviderPractice = {
  providerName: ShellSandboxEnforcementPracticeProviderName;
  source: {
    kind: "cli" | "agent-sdk" | "api-sdk" | "praxis-native";
    label: string;
    path?: string;
  };
  directCliSupport: boolean;
  sideEffectPolicy: "runtime-governed";
  notes: readonly string[];
  createProvider(dependencies: ShellSandboxEnforcementDependencies): ShellSandboxEnforcementProvider | undefined;
};

export const shellSandboxEnforcementDependencyDeclarations = [
  {
    dependencyId: "runtime.execEngine.shellGuard.enforceSandbox",
    kind: "runtime",
    required: true,
    description: "Runtime-owned shell sandbox enforcement port exposed through BaseToolExecutorPort.shell.enforceSandbox",
  },
  {
    dependencyId: "runtime.governancePlane.toolInvocationGrant",
    kind: "permission",
    required: true,
    description: "Runtime governance decision carried in context.guard for real sandbox enforcement dispatch",
  },
] satisfies readonly BaseToolDependencyDeclaration[];

export function createHostExecutorShellSandboxEnforcementProvider(
  executor: BaseToolExecutorPort | undefined,
): ShellSandboxEnforcementProvider | undefined {
  const run = executor?.shell?.enforceSandbox;
  if (run === undefined) {
    return undefined;
  }

  return async (request, context) => {
    const result = await run({
      command: request.command ?? "",
      workingDirectory: request.workingDirectory ?? "",
      requestedPaths: request.requestedPaths ?? [],
      accessIntents: request.accessIntents ?? [],
      policy: request.policy as Readonly<Record<string, unknown>> | undefined,
      context: context as Readonly<Record<string, unknown>>,
    });

    if (!result.ok) {
      throw Object.assign(new Error(result.error.message), { publicSafe: result.error.publicSafe });
    }

    return result.output as Partial<ShellSandboxEnforcementOutput>;
  };
}
