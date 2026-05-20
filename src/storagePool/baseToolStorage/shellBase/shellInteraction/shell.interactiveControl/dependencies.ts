import type { BaseToolDependencyDeclaration } from "../../../../../agentCore_executionEngine/basic_toolLayer/baseTools/baseToolDefinition.js";
import type { BaseToolExecutorPort } from "../../../../../agentCore_executionEngine/basic_toolLayer/baseTools/baseToolExecutorPort.js";
import type { ShellInteractiveControlOutput, ShellInteractiveControlRequest } from "./core.js";

export type ShellInteractiveControlPracticeProviderName = "anthropic" | "openai" | "deepmind" | "praxis-native";

export type ShellInteractiveControlProviderRequest = ShellInteractiveControlRequest;

export type ShellInteractiveControlProvider = (
  request: ShellInteractiveControlProviderRequest,
  context: NonNullable<ShellInteractiveControlRequest["context"]>,
) => ShellInteractiveControlOutput | Partial<ShellInteractiveControlOutput> | Promise<ShellInteractiveControlOutput | Partial<ShellInteractiveControlOutput>>;

export type ShellInteractiveControlDependencies = {
  executor?: BaseToolExecutorPort;
  provider?: ShellInteractiveControlProvider;
};

export type ShellInteractiveControlProviderPractice = {
  providerName: ShellInteractiveControlPracticeProviderName;
  source: { kind: "cli" | "agent-sdk" | "api-sdk" | "praxis-native"; label: string; path?: string };
  directCliSupport: boolean;
  sideEffectPolicy: "runtime-governed";
  notes: readonly string[];
  createProvider(dependencies: ShellInteractiveControlDependencies): ShellInteractiveControlProvider | undefined;
};

export const interactiveControlDependencyDeclarations = [
  { dependencyId: "runtime.execEngine.shellInteraction.controlInteractive", kind: "runtime", required: true, description: "Runtime-owned shell interaction port exposed through BaseToolExecutorPort.shell.controlInteractive" },
  { dependencyId: "runtime.governancePlane.toolInvocationGrant", kind: "permission", required: true, description: "Runtime governance decision carried in context.guard for real interaction dispatch" },
  { dependencyId: "runtime.shellSessionOwnership", kind: "runtime", required: true, description: "Runtime owns shell session/process lifecycle and validates session scope before side effects" },
] satisfies readonly BaseToolDependencyDeclaration[];

export function createHostExecutorShellInteractiveControlProvider(executor: BaseToolExecutorPort | undefined): ShellInteractiveControlProvider | undefined {
  const run = executor?.shell?.controlInteractive;
  if (run === undefined) return undefined;
  return async (request, context) => {
    const result = await run({
      target: (request.target ?? {}) as Readonly<Record<string, unknown>>,
      context: context as Readonly<Record<string, unknown>>,
    });
    if (!result.ok) throw new Error(result.error.message);
    return result.output as Partial<ShellInteractiveControlOutput>;
  };
}
