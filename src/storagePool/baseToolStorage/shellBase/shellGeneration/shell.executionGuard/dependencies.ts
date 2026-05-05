import type { BaseToolDependencyDeclaration } from "../../../../../agentCore/agent_executionEngine/basic_toolLayer/baseTools/baseToolDefinition.js";
import type { BaseToolExecutorPort } from "../../../../../agentCore/agent_executionEngine/basic_toolLayer/baseTools/baseToolExecutorPort.js";
import type { ShellProviderPracticeMetadata } from "../../_shared/baseToolAdapter.js";
import {
  optionalStringField,
  requireBooleanField,
  requireLiteralField,
  requireShellGenerationExecutorOutput,
  requireStringArrayField,
  requireStringLiteralArrayField,
  requireStringField,
  shellGenerationInputEnvelope,
  withShellGenerationProviderFlags,
} from "../_shared/hostExecutorProvider.js";
import type { ShellExecutionGuardOutput, ShellExecutionGuardRequest, ShellExecutionGuardResult } from "./core.js";

export type ShellExecutionGuardPracticeProviderName = "anthropic" | "openai" | "deepmind" | "praxis-native";

export type ShellExecutionGuardProvider = (
  request: ShellExecutionGuardRequest,
) => ShellExecutionGuardResult | Promise<ShellExecutionGuardResult>;

export type ShellExecutionGuardDependencies = {
  executor?: BaseToolExecutorPort;
  provider?: ShellExecutionGuardProvider;
};

export type ShellExecutionGuardProviderPractice = ShellProviderPracticeMetadata<
  ShellExecutionGuardPracticeProviderName,
  ShellExecutionGuardProvider,
  ShellExecutionGuardDependencies
>;

export const shellExecutionGuardDependencyDeclarations = [
  {
    dependencyId: "runtime.governancePlane.shellGenerationGuard",
    kind: "permission",
    required: true,
    description: "Runtime guard material used to classify generated shell commands before invocation construction",
  },
  {
    dependencyId: "runtime.governancePlane.shellGenerationGuardProvider",
    kind: "runtime",
    required: false,
    description: "Optional runtime provider exposed through BaseToolExecutorPort.shell.buildExecutionGuard",
  },
] satisfies readonly BaseToolDependencyDeclaration[];

export function normalizeShellExecutionGuardOutput(output: Readonly<Record<string, unknown>>): ShellExecutionGuardOutput {
  const flagged = withShellGenerationProviderFlags(output);
  if (!requireBooleanField(flagged, "executionBlocked") || requireBooleanField(flagged, "unsafeSideEffects")) {
    throw new Error("Shell generation executor returned unsafe execution guard flags");
  }
  const requiredPermissions = requireStringLiteralArrayField(flagged, "requiredPermissions", ["shell:generate", "shell:approve"]);
  return {
    kind: requireLiteralField(flagged, "kind", ["agentCore.basicTool.shell.executionGuard"]),
    command: requireStringField(flagged, "command", { nonEmpty: true }),
    argv: requireStringArrayField(flagged, "argv"),
    workingDirectory: optionalStringField(flagged, "workingDirectory"),
    verdict: requireLiteralField(flagged, "verdict", ["allowed", "requires-approval", "blocked"]),
    reasons: requireStringArrayField(flagged, "reasons"),
    requiredPermissions,
    requiresTapApproval: requireBooleanField(flagged, "requiresTapApproval"),
    dryRun: requireBooleanField(flagged, "dryRun"),
    providerCalled: requireBooleanField(flagged, "providerCalled"),
    executionBlocked: true,
    unsafeSideEffects: false,
  };
}

export function createHostExecutorShellExecutionGuardProvider(
  executor: BaseToolExecutorPort | undefined,
): ShellExecutionGuardProvider | undefined {
  const buildExecutionGuard = executor?.shell?.buildExecutionGuard;
  if (buildExecutionGuard === undefined) {
    return undefined;
  }

  return async (request) => {
    const result = await buildExecutionGuard(shellGenerationInputEnvelope(request));
    const output = requireShellGenerationExecutorOutput(result);
    return {
      ok: true,
      toolId: "shell.executionGuard",
      output: normalizeShellExecutionGuardOutput(output),
      audit: [],
      events: ["basicTool.shell.executionGuard.providerCalled"],
    };
  };
}
