import type { BaseToolDependencyDeclaration } from "../../../../../agentCore/agent_executionEngine/basic_toolLayer/baseTools/baseToolDefinition.js";
import type { BaseToolExecutorPort } from "../../../../../agentCore/agent_executionEngine/basic_toolLayer/baseTools/baseToolExecutorPort.js";
import type { ShellPromptHandlingOutput, ShellPromptHandlingRequest } from "./core.js";

export type ShellPromptHandlingPracticeProviderName = "anthropic" | "openai" | "deepmind" | "praxis-native";

export type ShellPromptHandlingProviderRequest = ShellPromptHandlingRequest;

export type ShellPromptHandlingProvider = (
  request: ShellPromptHandlingProviderRequest,
  context: NonNullable<ShellPromptHandlingRequest["context"]>,
) => ShellPromptHandlingOutput | Partial<ShellPromptHandlingOutput> | Promise<ShellPromptHandlingOutput | Partial<ShellPromptHandlingOutput>>;

export type ShellPromptHandlingDependencies = {
  executor?: BaseToolExecutorPort;
  provider?: ShellPromptHandlingProvider;
};

export type ShellPromptHandlingProviderPractice = {
  providerName: ShellPromptHandlingPracticeProviderName;
  source: { kind: "cli" | "agent-sdk" | "api-sdk" | "praxis-native"; label: string; path?: string };
  directCliSupport: boolean;
  sideEffectPolicy: "runtime-governed";
  notes: readonly string[];
  createProvider(dependencies: ShellPromptHandlingDependencies): ShellPromptHandlingProvider | undefined;
};

export const promptHandlingDependencyDeclarations = [
  { dependencyId: "runtime.execEngine.shellInteraction.handlePrompt", kind: "runtime", required: true, description: "Runtime-owned shell interaction port exposed through BaseToolExecutorPort.shell.handlePrompt" },
  { dependencyId: "runtime.governancePlane.toolInvocationGrant", kind: "permission", required: true, description: "Runtime governance decision carried in context.guard for real interaction dispatch" },
  { dependencyId: "runtime.shellSessionOwnership", kind: "runtime", required: true, description: "Runtime owns shell session/process lifecycle and validates session scope before side effects" },
] satisfies readonly BaseToolDependencyDeclaration[];

export function createHostExecutorShellPromptHandlingProvider(executor: BaseToolExecutorPort | undefined): ShellPromptHandlingProvider | undefined {
  const run = executor?.shell?.handlePrompt;
  if (run === undefined) return undefined;
  return async (request, context) => {
    const result = await run({
      target: (request.target ?? {}) as Readonly<Record<string, unknown>>,
      context: context as Readonly<Record<string, unknown>>,
    });
    if (!result.ok) throw new Error(result.error.message);
    return result.output as Partial<ShellPromptHandlingOutput>;
  };
}
