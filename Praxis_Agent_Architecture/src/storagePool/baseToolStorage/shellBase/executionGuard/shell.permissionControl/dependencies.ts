import type { BaseToolDependencyDeclaration } from "../../../../../agentCore/agent_executionEngine/basic_toolLayer/baseTools/baseToolDefinition.js";
import type { BaseToolExecutorPort } from "../../../../../agentCore/agent_executionEngine/basic_toolLayer/baseTools/baseToolExecutorPort.js";
import type { ShellPermissionControlOutput, ShellPermissionControlRequest } from "./core.js";

export type ShellPermissionControlPracticeProviderName = "anthropic" | "openai" | "deepmind" | "praxis-native";

export type ShellPermissionControlProvider = (
  request: ShellPermissionControlRequest,
  context: NonNullable<ShellPermissionControlRequest["context"]>,
) =>
  | ShellPermissionControlOutput
  | Partial<ShellPermissionControlOutput>
  | Promise<ShellPermissionControlOutput | Partial<ShellPermissionControlOutput>>;

export type ShellPermissionControlDependencies = {
  executor?: BaseToolExecutorPort;
  provider?: ShellPermissionControlProvider;
};

export type ShellPermissionControlProviderPractice = {
  providerName: ShellPermissionControlPracticeProviderName;
  source: {
    kind: "cli" | "agent-sdk" | "api-sdk" | "praxis-native";
    label: string;
    path?: string;
  };
  directCliSupport: boolean;
  sideEffectPolicy: "runtime-governed";
  notes: readonly string[];
  createProvider(dependencies: ShellPermissionControlDependencies): ShellPermissionControlProvider | undefined;
};

export const shellPermissionControlDependencyDeclarations = [
  {
    dependencyId: "runtime.execEngine.shellGuard.controlPermission",
    kind: "runtime",
    required: true,
    description: "Runtime-owned shell permission control port exposed through BaseToolExecutorPort.shell.controlPermission",
  },
  {
    dependencyId: "runtime.governancePlane.toolInvocationGrant",
    kind: "permission",
    required: true,
    description: "Runtime governance decision carried in context.guard for real permission control dispatch",
  },
] satisfies readonly BaseToolDependencyDeclaration[];

export function createHostExecutorShellPermissionControlProvider(
  executor: BaseToolExecutorPort | undefined,
): ShellPermissionControlProvider | undefined {
  const run = executor?.shell?.controlPermission;
  if (run === undefined) {
    return undefined;
  }

  return async (request, context) => {
    const result = await run({
      command: request.command ?? "",
      workingDirectory: request.workingDirectory,
      requestedPermissions: request.requestedPermissions ?? [],
      riskLevel: request.riskLevel ?? "low",
      context: context as Readonly<Record<string, unknown>>,
    });

    if (!result.ok) {
      throw Object.assign(new Error(result.error.message), { publicSafe: result.error.publicSafe });
    }

    return result.output as Partial<ShellPermissionControlOutput>;
  };
}
