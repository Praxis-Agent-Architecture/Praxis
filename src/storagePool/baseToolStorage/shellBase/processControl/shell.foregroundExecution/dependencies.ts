import type { BaseToolDependencyDeclaration } from "../../../../../executionEngine/basic_toolLayer/baseTools/baseToolDefinition.js";
import type { BaseToolExecutorPort } from "../../../../../executionEngine/basic_toolLayer/baseTools/baseToolExecutorPort.js";
import type { ShellToolContext } from "../../shellExecution/shell.commandExecution/core.js";
import type { ShellForegroundExecutionRequest } from "./core.js";

export type ShellForegroundExecutionPracticeProviderName = "anthropic" | "openai" | "deepmind" | "praxis-native";

export type ShellForegroundExecutionProviderResult = {
  resultEnvelope?: Readonly<Record<string, unknown>>;
  metadata?: Readonly<Record<string, unknown>>;
};

export type ShellForegroundExecutionProvider = (
  request: ShellForegroundExecutionRequest,
  context: ShellToolContext,
) => ShellForegroundExecutionProviderResult | Promise<ShellForegroundExecutionProviderResult>;

export type ShellForegroundExecutionDependencies = {
  executor?: BaseToolExecutorPort;
  provider?: ShellForegroundExecutionProvider;
};

export type ShellForegroundExecutionProviderPractice = {
  providerName: ShellForegroundExecutionPracticeProviderName;
  source: {
    kind: "cli" | "agent-sdk" | "api-sdk" | "praxis-native";
    label: string;
    path?: string;
  };
  directCliSupport: boolean;
  sideEffectPolicy: "runtime-governed";
  notes: readonly string[];
  createProvider(dependencies: ShellForegroundExecutionDependencies): ShellForegroundExecutionProvider | undefined;
};

export const shellForegroundExecutionDependencyDeclarations = [
  {
    dependencyId: "runtime.execEngine.shellExecutor",
    kind: "runtime",
    required: true,
    description: "Runtime-provided foreground shell execution provider; baseTools do not own shell/process side effects",
  },
  {
    dependencyId: "runtime.governancePlane.toolInvocationGrant",
    kind: "permission",
    required: true,
    description: "Runtime governance decision carried in context.guard for real execution",
  },
  {
    dependencyId: "runtime.capabilityExposure.shellAuditEnvelope",
    kind: "runtime",
    required: true,
    description: "Runtime audit envelope for process lifecycle and shell output material",
  },
] satisfies readonly BaseToolDependencyDeclaration[];

export function createHostExecutorShellForegroundExecutionProvider(
  executor: BaseToolExecutorPort | undefined,
): ShellForegroundExecutionProvider | undefined {
  const run = executor?.shell?.run;
  if (run === undefined) {
    return undefined;
  }

  return async (request: ShellForegroundExecutionRequest, _context: ShellToolContext) => {
    const target = request.target ?? {};
    if (typeof target.command !== "string" || target.command.trim().length === 0) {
      throw new Error("shell.foregroundExecution requires a runtime command target");
    }
    const result = await run({
      command: target.shell ?? "sh",
      args: ["-lc", target.command],
      cwd: typeof target.workingDirectory === "string" ? target.workingDirectory : undefined,
      timeoutMs: typeof target.timeoutMs === "number" ? target.timeoutMs : undefined,
      stdin: typeof target.stdin === "string" ? target.stdin : undefined,
    });
    if (!result.ok) {
      const error = new Error(result.error.message);
      error.name = result.error.code;
      throw error;
    }

    return {
      resultEnvelope: result.output,
      metadata: { hostExecutor: "BaseToolExecutorPort.shell.run" },
    };
  };
}
