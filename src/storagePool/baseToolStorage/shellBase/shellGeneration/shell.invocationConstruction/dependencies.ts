import type { BaseToolDependencyDeclaration } from "../../../../../agentCore_executionEngine/basic_toolLayer/baseTools/baseToolDefinition.js";
import type { BaseToolExecutorPort } from "../../../../../agentCore_executionEngine/basic_toolLayer/baseTools/baseToolExecutorPort.js";
import type { ShellProviderPracticeMetadata } from "../../_shared/baseToolAdapter.js";
import {
  optionalRecordField,
  optionalStringField,
  requireBooleanField,
  requireLiteralField,
  requireShellGenerationExecutorOutput,
  requireStringArrayField,
  requireStringField,
  shellGenerationInputEnvelope,
  withShellGenerationProviderFlags,
} from "../_shared/hostExecutorProvider.js";
import type { ShellInvocationConstructionRequest, ShellInvocationConstructionResult, ShellInvocationEnvelope } from "./core.js";

export type ShellInvocationConstructionPracticeProviderName = "anthropic" | "openai" | "deepmind" | "praxis-native";

export type ShellInvocationConstructionProvider = (
  request: ShellInvocationConstructionRequest,
) => ShellInvocationConstructionResult | Promise<ShellInvocationConstructionResult>;

export type ShellInvocationConstructionDependencies = {
  executor?: BaseToolExecutorPort;
  provider?: ShellInvocationConstructionProvider;
};

export type ShellInvocationConstructionProviderPractice = ShellProviderPracticeMetadata<
  ShellInvocationConstructionPracticeProviderName,
  ShellInvocationConstructionProvider,
  ShellInvocationConstructionDependencies
>;

export const shellInvocationConstructionDependencyDeclarations = [
  {
    dependencyId: "runtime.generationPlane.shellInvocationEnvelope",
    kind: "runtime",
    required: true,
    description: "Runtime-visible invocation envelope created from generated command and execution guard material",
  },
  {
    dependencyId: "runtime.generationPlane.shellInvocationProvider",
    kind: "runtime",
    required: false,
    description: "Optional runtime provider exposed through BaseToolExecutorPort.shell.constructInvocation",
  },
] satisfies readonly BaseToolDependencyDeclaration[];

export function normalizeShellInvocationEnvelope(output: Readonly<Record<string, unknown>>): ShellInvocationEnvelope {
  const flagged = withShellGenerationProviderFlags(output);
  if (!requireBooleanField(flagged, "executionBlocked") || requireBooleanField(flagged, "unsafeSideEffects")) {
    throw new Error("Shell generation executor returned unsafe invocation construction flags");
  }
  return {
    kind: requireLiteralField(flagged, "kind", ["agentCore.basicTool.shell.invocation"]),
    invocationId: requireStringField(flagged, "invocationId", { nonEmpty: true }),
    runtimeId: optionalStringField(flagged, "runtimeId"),
    sessionId: optionalStringField(flagged, "sessionId"),
    shell: requireLiteralField(flagged, "shell", ["sh", "bash", "zsh"]),
    commandLine: requireStringField(flagged, "commandLine", { nonEmpty: true }),
    argv: requireStringArrayField(flagged, "argv"),
    executable: requireStringField(flagged, "executable", { nonEmpty: true }),
    workingDirectory: optionalStringField(flagged, "workingDirectory"),
    environmentKeys: requireStringArrayField(flagged, "environmentKeys"),
    guardVerdict: requireLiteralField(flagged, "guardVerdict", ["allowed", "requires-approval", "blocked"]),
    approvalRequired: requireBooleanField(flagged, "approvalRequired"),
    status: requireLiteralField(flagged, "status", ["planned", "pending-approval"]),
    metadata: optionalRecordField(flagged, "metadata") ?? {},
    dryRun: requireBooleanField(flagged, "dryRun"),
    providerCalled: requireBooleanField(flagged, "providerCalled"),
    executionBlocked: true,
    unsafeSideEffects: false,
  };
}

export function createHostExecutorShellInvocationConstructionProvider(
  executor: BaseToolExecutorPort | undefined,
): ShellInvocationConstructionProvider | undefined {
  const constructInvocation = executor?.shell?.constructInvocation;
  if (constructInvocation === undefined) {
    return undefined;
  }

  return async (request) => {
    const result = await constructInvocation(shellGenerationInputEnvelope(request));
    const output = requireShellGenerationExecutorOutput(result);
    return {
      ok: true,
      toolId: "shell.invocationConstruction",
      invocation: normalizeShellInvocationEnvelope(output),
      audit: [],
      events: ["basicTool.shell.invocationConstruction.providerCalled"],
    };
  };
}
