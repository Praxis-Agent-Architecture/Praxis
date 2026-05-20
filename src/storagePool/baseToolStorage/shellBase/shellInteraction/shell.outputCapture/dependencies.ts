import type { BaseToolDependencyDeclaration } from "../../../../../executionEngine/basic_toolLayer/baseTools/baseToolDefinition.js";
import type { BaseToolExecutorPort } from "../../../../../executionEngine/basic_toolLayer/baseTools/baseToolExecutorPort.js";
import type { ShellOutputCaptureOutput, ShellOutputCaptureRequest } from "./core.js";

export type ShellOutputCapturePracticeProviderName = "anthropic" | "openai" | "deepmind" | "praxis-native";

export type ShellOutputCaptureProviderRequest = ShellOutputCaptureRequest;

export type ShellOutputCaptureProvider = (
  request: ShellOutputCaptureProviderRequest,
  context: NonNullable<ShellOutputCaptureRequest["context"]>,
) => ShellOutputCaptureOutput | Partial<ShellOutputCaptureOutput> | Promise<ShellOutputCaptureOutput | Partial<ShellOutputCaptureOutput>>;

export type ShellOutputCaptureDependencies = {
  executor?: BaseToolExecutorPort;
  provider?: ShellOutputCaptureProvider;
};

export type ShellOutputCaptureProviderPractice = {
  providerName: ShellOutputCapturePracticeProviderName;
  source: { kind: "cli" | "agent-sdk" | "api-sdk" | "praxis-native"; label: string; path?: string };
  directCliSupport: boolean;
  sideEffectPolicy: "runtime-governed";
  notes: readonly string[];
  createProvider(dependencies: ShellOutputCaptureDependencies): ShellOutputCaptureProvider | undefined;
};

export const outputCaptureDependencyDeclarations = [
  { dependencyId: "runtime.execEngine.shellInteraction.captureOutput", kind: "runtime", required: true, description: "Runtime-owned shell interaction port exposed through BaseToolExecutorPort.shell.captureOutput" },
  { dependencyId: "runtime.governancePlane.toolInvocationGrant", kind: "permission", required: true, description: "Runtime governance decision carried in context.guard for real interaction dispatch" },
  { dependencyId: "runtime.shellSessionOwnership", kind: "runtime", required: true, description: "Runtime owns shell session/process lifecycle and validates session scope before side effects" },
] satisfies readonly BaseToolDependencyDeclaration[];

export function createHostExecutorShellOutputCaptureProvider(executor: BaseToolExecutorPort | undefined): ShellOutputCaptureProvider | undefined {
  const run = executor?.shell?.captureOutput;
  if (run === undefined) return undefined;
  return async (request, context) => {
    const result = await run({
      target: (request.target ?? {}) as Readonly<Record<string, unknown>>,
      context: context as Readonly<Record<string, unknown>>,
    });
    if (!result.ok) throw new Error(result.error.message);
    return result.output as Partial<ShellOutputCaptureOutput>;
  };
}
