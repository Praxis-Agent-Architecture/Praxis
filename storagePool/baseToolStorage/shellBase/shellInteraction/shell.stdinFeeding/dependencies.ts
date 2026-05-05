import type { BaseToolDependencyDeclaration } from "../../../../../agentCore/agent_executionEngine/basic_toolLayer/baseTools/baseToolDefinition.js";
import type { BaseToolExecutorPort } from "../../../../../agentCore/agent_executionEngine/basic_toolLayer/baseTools/baseToolExecutorPort.js";
import type { ShellStdinFeedingOutput, ShellStdinFeedingRequest } from "./core.js";

export type ShellStdinFeedingPracticeProviderName = "anthropic" | "openai" | "deepmind" | "praxis-native";

export type ShellStdinFeedingProviderRequest = ShellStdinFeedingRequest;

export type ShellStdinFeedingProvider = (
  request: ShellStdinFeedingProviderRequest,
  context: NonNullable<ShellStdinFeedingRequest["context"]>,
) => ShellStdinFeedingOutput | Partial<ShellStdinFeedingOutput> | Promise<ShellStdinFeedingOutput | Partial<ShellStdinFeedingOutput>>;

export type ShellStdinFeedingDependencies = {
  executor?: BaseToolExecutorPort;
  provider?: ShellStdinFeedingProvider;
};

export type ShellStdinFeedingProviderPractice = {
  providerName: ShellStdinFeedingPracticeProviderName;
  source: { kind: "cli" | "agent-sdk" | "api-sdk" | "praxis-native"; label: string; path?: string };
  directCliSupport: boolean;
  sideEffectPolicy: "runtime-governed";
  notes: readonly string[];
  createProvider(dependencies: ShellStdinFeedingDependencies): ShellStdinFeedingProvider | undefined;
};

export const stdinFeedingDependencyDeclarations = [
  { dependencyId: "runtime.execEngine.shellInteraction.feedStdin", kind: "runtime", required: true, description: "Runtime-owned shell interaction port exposed through BaseToolExecutorPort.shell.feedStdin" },
  { dependencyId: "runtime.governancePlane.toolInvocationGrant", kind: "permission", required: true, description: "Runtime governance decision carried in context.guard for real interaction dispatch" },
  { dependencyId: "runtime.shellSessionOwnership", kind: "runtime", required: true, description: "Runtime owns shell session/process lifecycle and validates session scope before side effects" },
] satisfies readonly BaseToolDependencyDeclaration[];

export function createHostExecutorShellStdinFeedingProvider(executor: BaseToolExecutorPort | undefined): ShellStdinFeedingProvider | undefined {
  const run = executor?.shell?.feedStdin;
  if (run === undefined) return undefined;
  return async (request, context) => {
    const result = await run({
      target: (request.target ?? {}) as Readonly<Record<string, unknown>>,
      context: context as Readonly<Record<string, unknown>>,
    });
    if (!result.ok) throw new Error(result.error.message);
    return result.output as Partial<ShellStdinFeedingOutput>;
  };
}
