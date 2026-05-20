import type { BaseToolDependencyDeclaration } from "../../../../../agentCore/agent_executionEngine/basic_toolLayer/baseTools/baseToolDefinition.js";
import type { BaseToolExecutorPort } from "../../../../../agentCore/agent_executionEngine/basic_toolLayer/baseTools/baseToolExecutorPort.js";
import type { ShellProviderPracticeMetadata } from "../../_shared/baseToolAdapter.js";
import {
  optionalStringField,
  requireBooleanField,
  requireLiteralField,
  requireShellGenerationExecutorOutput,
  requireStringArrayField,
  requireStringField,
  shellGenerationInputEnvelope,
  withShellGenerationProviderFlags,
} from "../_shared/hostExecutorProvider.js";
import type { ShellCommandGenerationOutput, ShellCommandGenerationRequest, ShellCommandGenerationResult } from "./core.js";

export type ShellCommandGenerationPracticeProviderName = "anthropic" | "openai" | "deepmind" | "praxis-native";

export type ShellCommandGenerationProvider = (
  request: ShellCommandGenerationRequest,
) => ShellCommandGenerationResult | Promise<ShellCommandGenerationResult>;

export type ShellCommandGenerationDependencies = {
  executor?: BaseToolExecutorPort;
  provider?: ShellCommandGenerationProvider;
};

export type ShellCommandGenerationProviderPractice = ShellProviderPracticeMetadata<
  ShellCommandGenerationPracticeProviderName,
  ShellCommandGenerationProvider,
  ShellCommandGenerationDependencies
>;

export const shellCommandGenerationDependencyDeclarations = [
  {
    dependencyId: "runtime.generationPlane.shellCommandPolicy",
    kind: "permission",
    required: true,
    description: "Runtime permission hint allowing shell command-line generation without executing a process",
  },
  {
    dependencyId: "runtime.generationPlane.shellCommandProvider",
    kind: "runtime",
    required: false,
    description: "Optional runtime provider exposed through BaseToolExecutorPort.shell.generateCommand",
  },
] satisfies readonly BaseToolDependencyDeclaration[];

export function normalizeShellCommandGenerationOutput(output: Readonly<Record<string, unknown>>): ShellCommandGenerationOutput {
  const flagged = withShellGenerationProviderFlags(output);
  if (!requireBooleanField(flagged, "executionBlocked") || requireBooleanField(flagged, "unsafeSideEffects")) {
    throw new Error("Shell generation executor returned unsafe command generation flags");
  }
  return {
    kind: requireLiteralField(flagged, "kind", ["agentCore.basicTool.shell.commandGeneration"]),
    shell: requireLiteralField(flagged, "shell", ["sh", "bash", "zsh"]),
    commandLine: requireStringField(flagged, "commandLine", { nonEmpty: true }),
    argv: requireStringArrayField(flagged, "argv"),
    executable: requireStringField(flagged, "executable", { nonEmpty: true }),
    workingDirectory: optionalStringField(flagged, "workingDirectory"),
    environmentKeys: requireStringArrayField(flagged, "environmentKeys"),
    requiredPermission: requireLiteralField(flagged, "requiredPermission", ["shell:generate"]),
    dryRun: requireBooleanField(flagged, "dryRun"),
    providerCalled: requireBooleanField(flagged, "providerCalled"),
    executionBlocked: true,
    unsafeSideEffects: false,
  };
}

export function createHostExecutorShellCommandGenerationProvider(
  executor: BaseToolExecutorPort | undefined,
): ShellCommandGenerationProvider | undefined {
  const generateCommand = executor?.shell?.generateCommand;
  if (generateCommand === undefined) {
    return undefined;
  }

  return async (request) => {
    const result = await generateCommand(shellGenerationInputEnvelope(request));
    const output = requireShellGenerationExecutorOutput(result);
    return {
      ok: true,
      toolId: "shell.commandGeneration",
      output: normalizeShellCommandGenerationOutput(output),
      audit: [],
      events: ["basicTool.shell.commandGeneration.providerCalled"],
    };
  };
}
